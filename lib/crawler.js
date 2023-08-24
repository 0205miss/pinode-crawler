"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.Crawler = exports.CrawlerConfiguration = void 0;
const js_stellar_domain_1 = require("@stellarbeat/js-stellar-domain");
const async_1 = require("async");
const js_stellar_node_connector_1 = require("@stellarbeat/js-stellar-node-connector");
const stellar_base_1 = require("stellar-base");
const peer_node_1 = require("./peer-node");
const crawl_state_1 = require("./crawl-state");
function nodeAddressToPeerKey(nodeAddress) {
    return nodeAddress[0] + ':' + nodeAddress[1];
}
class CrawlerConfiguration {
    constructor(nodeConfig, maxOpenConnections = 25, maxCrawlTime = 1800000, blackList = new Set()) {
        this.nodeConfig = nodeConfig;
        this.maxOpenConnections = maxOpenConnections;
        this.maxCrawlTime = maxCrawlTime;
        this.blackList = blackList;
    }
}
exports.CrawlerConfiguration = CrawlerConfiguration;
/**
 * The Crawler manages the connections to every discovered Node Address. If a node is participating in SCP, it keeps listening until it can determine if it is validating correctly.
 */
class Crawler {
    constructor(config, node, quorumSetManager, scpManager, logger) {
        this.scpManager = scpManager;
        this.config = config;
        this.logger = logger.child({ mod: 'Crawler' });
        this.quorumSetManager = quorumSetManager;
        this.crawlerNode = node;
        this.blackList = config.blackList;
        this.crawlQueue = (0, async_1.queue)(this.processCrawlPeerNodeInCrawlQueue.bind(this), config.maxOpenConnections);
    }
    /*
     * @param topTierQuorumSet QuorumSet of top tier nodes that the crawler should trust to close ledgers and determine the correct externalized value.
     * Top tier nodes are trusted by everyone transitively, otherwise there would be no quorum intersection. Stellar core forwards scp messages of every transitively trusted node. Thus we can close ledgers when connecting to any node.
     */
    crawl(nodeAddresses, topTierQuorumSet, latestClosedLedger = {
        sequence: BigInt(0),
        closeTime: new Date(0)
    }, quorumSets = new Map()) {
        return __awaiter(this, void 0, void 0, function* () {
            console.time('crawl');
            const crawlState = new crawl_state_1.CrawlState(topTierQuorumSet, quorumSets, latestClosedLedger, this.logger); //todo dependency inversion?
            this.logger.info('Starting crawl with seed of ' + nodeAddresses.length + 'addresses.');
            return yield new Promise((resolve, reject) => {
                const maxCrawlTimeout = setTimeout(() => {
                    this.logger.fatal('Max crawl time hit, closing all connections');
                    crawlState.openConnections.forEach((connection) => this.disconnect(connection, crawlState));
                    crawlState.maxCrawlTimeHit = true;
                }, this.config.maxCrawlTime);
                this.crawlQueue.drain(() => {
                    clearTimeout(maxCrawlTimeout);
                    this.wrapUp(resolve, reject, crawlState);
                }); //when queue is empty, we wrap up the crawl
                nodeAddresses.forEach((address) => this.crawlPeerNode(address, crawlState));
            });
        });
    }
    crawlPeerNode(nodeAddress, crawlState) {
        const peerKey = nodeAddressToPeerKey(nodeAddress);
        if (crawlState.crawledNodeAddresses.has(peerKey)) {
            this.logger.debug({ peer: peerKey }, 'Address already crawled');
            return;
        }
        this.logger.debug({ peer: peerKey }, 'Adding address to crawl queue');
        crawlState.crawledNodeAddresses.add(peerKey);
        this.crawlQueue.push([
            {
                nodeAddress: nodeAddress,
                crawlState: crawlState
            }
        ], (error) => {
            if (error)
                this.logger.error({ peer: peerKey }, error.message);
        });
    }
    processCrawlPeerNodeInCrawlQueue(crawlQueueTask, crawlQueueTaskDone) {
        const connection = this.crawlerNode.connectTo(crawlQueueTask.nodeAddress[0], crawlQueueTask.nodeAddress[1]);
        this.logger.debug({ peer: connection.remoteAddress }, 'Connecting');
        connection
            .on('error', (error) => {
            this.logger.debug({ peer: connection.remoteAddress }, 'error: ' + error.message);
            this.disconnect(connection, crawlQueueTask.crawlState, error);
        })
            .on('connect', (publicKey, nodeInfo) => this.onConnected(connection, publicKey, nodeInfo, crawlQueueTask.crawlState))
            .on('data', (stellarMessageWork) => {
            this.onStellarMessage(connection, stellarMessageWork.stellarMessage, crawlQueueTask.crawlState);
            stellarMessageWork.done();
        })
            .on('timeout', () => this.onTimeout(connection, crawlQueueTask.crawlState))
            .on('close', () => this.onConnectionClose(connection, crawlQueueTask.crawlState, crawlQueueTaskDone));
    }
    onTimeout(connection, crawlState) {
        this.logger.debug({ peer: connection.remoteAddress }, 'Connection timeout');
        this.disconnect(connection, crawlState);
    }
    onConnected(connection, publicKey, nodeInfo, crawlState) {
        this.logger.debug({ peer: connection.remoteAddress, pk: publicKey }, 'Connected');
        if (this.blackList.has(publicKey)) {
            this.logger.info({
                peer: connection.remoteAddress,
                pk: publicKey
            }, 'PeerNode on blacklist' + publicKey);
            this.disconnect(connection, crawlState);
            return;
        }
        let peerNode = crawlState.peerNodes.get(publicKey);
        if (peerNode && peerNode.successfullyConnected) {
            //this public key is already used in this crawl! A node is not allowed to reuse public keys. Disconnecting.
            this.logger.info({
                peer: connection.remoteAddress,
                pk: publicKey
            }, 'PeerNode reusing publicKey on address ' + peerNode.key);
            this.disconnect(connection, crawlState, new Error('PeerNode reusing publicKey on address ' + peerNode.key));
            return; //we don't return this peerNode to consumer of this library
        }
        if (!peerNode) {
            peerNode = new peer_node_1.PeerNode(publicKey);
        }
        peerNode.nodeInfo = nodeInfo;
        peerNode.ip = connection.remoteIp;
        peerNode.port = connection.remotePort;
        crawlState.peerNodes.set(publicKey, peerNode);
        crawlState.openConnections.set(publicKey, connection);
        /*if (!this._nodesThatSuppliedPeerList.has(connection.peer)) { //Most nodes send their peers automatically on successful handshake, better handled with timer.
            this._connectionManager.sendGetPeers(connection);
        }*/
        this.listen(peerNode, connection, 0, crawlState);
    }
    onStellarMessage(connection, stellarMessage, crawlState) {
        switch (stellarMessage.switch()) {
            case stellar_base_1.xdr.MessageType.scpMessage(): {
                const result = this.scpManager.processScpEnvelope(stellarMessage.envelope(), crawlState);
                if (result.isErr())
                    this.disconnect(connection, crawlState, result.error);
                break;
            }
            case stellar_base_1.xdr.MessageType.peers():
                this.onPeersReceived(connection, stellarMessage.peers(), crawlState);
                break;
            case stellar_base_1.xdr.MessageType.scpQuorumset():
                this.onQuorumSetReceived(connection, stellarMessage.qSet(), crawlState);
                break;
            case stellar_base_1.xdr.MessageType.dontHave(): {
                this.logger.info({
                    pk: connection.remotePublicKey,
                    type: stellarMessage.dontHave().type().name
                }, "Don't have");
                if (stellarMessage.dontHave().type().value ===
                    stellar_base_1.xdr.MessageType.getScpQuorumset().value) {
                    this.logger.info({
                        pk: connection.remotePublicKey,
                        hash: stellarMessage.dontHave().reqHash().toString('base64')
                    }, "Don't have");
                    if (connection.remotePublicKey) {
                        this.quorumSetManager.peerNodeDoesNotHaveQuorumSet(connection.remotePublicKey, stellarMessage.dontHave().reqHash().toString('base64'), crawlState);
                    }
                }
                break;
            }
            case stellar_base_1.xdr.MessageType.errorMsg():
                this.onStellarMessageErrorReceived(connection, stellarMessage.error(), crawlState);
                break;
        }
    }
    onStellarMessageErrorReceived(connection, errorMessage, crawlState) {
        switch (errorMessage.code()) {
            case stellar_base_1.xdr.ErrorCode.errLoad():
                this.onLoadTooHighReceived(connection, crawlState);
                break;
            default:
                this.logger.info({
                    pk: connection.remotePublicKey,
                    peer: connection.remoteIp + ':' + connection.remotePort,
                    error: errorMessage.code().name
                }, errorMessage.msg().toString());
                break;
        }
        this.disconnect(connection, crawlState, new Error(errorMessage.msg().toString()));
    }
    onConnectionClose(connection, crawlState, crawlQueueTaskDone) {
        this.logger.debug({ pk: connection.remotePublicKey, peer: connection.remoteAddress }, 'Node disconnected');
        if (connection.remotePublicKey) {
            this.quorumSetManager.onNodeDisconnected(connection.remotePublicKey, crawlState);
            const peer = crawlState.peerNodes.get(connection.remotePublicKey);
            if (peer && peer.key === connection.remoteAddress) {
                const timeout = crawlState.listenTimeouts.get(connection.remotePublicKey);
                if (timeout)
                    clearTimeout(timeout);
                crawlState.openConnections.delete(connection.remotePublicKey);
            } //if peer.key differs from remoteAddress,then this is a connection to a an ip that reuses a publicKey. These connections are ignored and we should make sure we don't interfere with a possible connection to the other ip that uses the public key.
        }
        else {
            crawlState.failedConnections.push(connection.remoteAddress);
            this.logger.debug({
                ip: connection.remoteAddress,
                leftInQueue: this.crawlQueue.length()
            }, 'handshake failed');
        }
        if (this.crawlQueue.length() !== 0 && this.crawlQueue.length() % 50 === 0) {
            this.logger.info('nodes left in queue: ' + this.crawlQueue.length());
        }
        crawlQueueTaskDone();
    }
    onPeersReceived(connection, peers, crawlState) {
        const peerAddresses = [];
        peers.forEach((peer) => {
            const ipResult = (0, js_stellar_node_connector_1.getIpFromPeerAddress)(peer);
            if (ipResult.isOk())
                peerAddresses.push([ipResult.value, peer.port()]);
        });
        this.logger.debug({ peer: connection.remoteAddress }, peerAddresses.length + ' peers received');
        if (connection.remotePublicKey) {
            const peer = crawlState.peerNodes.get(connection.remotePublicKey);
            if (peer)
                peer.suppliedPeerList = true;
        }
        peerAddresses.forEach((peerAddress) => this.crawlPeerNode(peerAddress, crawlState));
    }
    onLoadTooHighReceived(connection, crawlState) {
        this.logger.debug({ peer: connection.remoteAddress }, 'Load too high message received');
        if (connection.remotePublicKey) {
            const node = crawlState.peerNodes.get(connection.remotePublicKey);
            if (node) {
                node.overLoaded = true;
            }
        }
    }
    onQuorumSetReceived(connection, quorumSetMessage, crawlState) {
        const quorumSetHash = (0, stellar_base_1.hash)(quorumSetMessage.toXDR()).toString('base64');
        const quorumSetResult = (0, js_stellar_node_connector_1.getQuorumSetFromMessage)(quorumSetMessage);
        if (quorumSetResult.isErr()) {
            this.disconnect(connection, crawlState, quorumSetResult.error);
            return;
        }
        this.logger.info({
            pk: connection.remotePublicKey,
            hash: quorumSetHash
        }, 'QuorumSet received');
        if (connection.remotePublicKey)
            this.quorumSetManager.processQuorumSet(quorumSetHash, js_stellar_domain_1.QuorumSet.fromJSON(quorumSetResult.value), connection.remotePublicKey, crawlState);
    }
    disconnect(connection, crawlState, error) {
        this.logger.trace({
            peer: connection.remoteAddress,
            pk: connection.remotePublicKey,
            error: error === null || error === void 0 ? void 0 : error.message
        }, 'Disconnecting');
        //destroy should always trigger close event, where connection cleanup already happens
        /*if (connection.remotePublicKey) {
            crawlState.openConnections.delete(connection.remotePublicKey); //we don't want to send any more commands
            const timeout = crawlState.listenTimeouts.get(connection.remotePublicKey);
            if (timeout) clearTimeout(timeout);
        }*/
        connection.destroy();
    }
    listenFurther(peer, timeoutCounter = 0) {
        if (timeoutCounter === 0)
            return true; //everyone gets a first listen. If it is already confirmed validating, we can still use it to request unknown quorumSets from.
        if (timeoutCounter >= 17)
            return false; //we wait for 100 seconds max (maxCounter = 100 / SCP_TIMEOUT)if node is trying to reach consensus.
        if (peer.isValidatingIncorrectValues)
            return false;
        if (!peer.participatingInSCP)
            return false; //watcher node
        if (peer.isValidating && peer.quorumSet)
            //todo: a peer that is validating but doesnt have it's own quorumSet, could keep listening until max.
            return false; //we have all the needed information
        return true;
    }
    listen(peer, connection, timeoutCounter = 0, crawlState) {
        if (!this.listenFurther(peer, timeoutCounter)) {
            this.logger.debug({
                pk: peer.publicKey,
                counter: timeoutCounter,
                validating: peer.isValidating,
                validatingIncorrectly: peer.isValidatingIncorrectValues,
                scp: peer.participatingInSCP
            }, 'Disconnect');
            this.disconnect(connection, crawlState);
            return;
        }
        this.logger.debug({
            pk: peer.publicKey,
            latestActiveSlotIndex: peer.latestActiveSlotIndex
        }, 'Listening for externalize msg');
        crawlState.listenTimeouts.set(peer.publicKey, setTimeout(() => {
            this.logger.debug({ pk: peer.publicKey }, 'SCP Listen timeout reached');
            timeoutCounter++;
            this.listen(peer, connection, timeoutCounter, crawlState);
        }, Crawler.SCP_LISTEN_TIMEOUT));
    }
    wrapUp(resolve, reject, crawlState) {
        this.logger.info({ peers: crawlState.failedConnections }, 'Failed connections');
        crawlState.peerNodes.forEach((peer) => {
            this.logger.info({
                ip: peer.key,
                pk: peer.publicKey,
                connected: peer.successfullyConnected,
                scp: peer.participatingInSCP,
                validating: peer.isValidating,
                overLoaded: peer.overLoaded
            });
        });
        this.logger.info('processed all nodes in queue');
        this.logger.info('Connection attempts: ' + crawlState.crawledNodeAddresses.size);
        this.logger.info('Detected public keys: ' + crawlState.peerNodes.size);
        this.logger.info('Successful connections: ' +
            Array.from(crawlState.peerNodes.values()).filter((peer) => peer.successfullyConnected).length);
        this.logger.info('Validating nodes: ' +
            Array.from(crawlState.peerNodes.values()).filter((node) => node.isValidating).length);
        this.logger.info('Overloaded nodes: ' +
            Array.from(crawlState.peerNodes.values()).filter((node) => node.overLoaded).length);
        this.logger.info('Closed ledgers: ' + crawlState.slots.getClosedSlotIndexes().length);
        this.logger.info(Array.from(crawlState.peerNodes.values()).filter((node) => node.suppliedPeerList).length + ' supplied us with a peers list.');
        console.timeEnd('crawl');
        /*		if (crawlState.maxCrawlTimeHit)
                    reject(new Error('Max crawl time hit, closing crawler'));
        */
        resolve({
            peers: crawlState.peerNodes,
            closedLedgers: crawlState.slots.getClosedSlotIndexes(),
            latestClosedLedger: crawlState.latestClosedLedger
        });
    }
}
exports.Crawler = Crawler;
Crawler.SCP_LISTEN_TIMEOUT = 6000; //how long do we listen to determine if a node is participating in SCP. Correlated with Herder::EXP_LEDGER_TIMESPAN_SECONDS
//# sourceMappingURL=crawler.js.map
import {PublicKey, QuorumSet} from "@stellarbeat/js-stellar-domain";
import * as P from "pino";
import {Logger} from "pino";
import {xdr} from "stellar-base";
import {PeerNode} from "./peer-node";
import {CrawlState}  from "./crawl-state";

type QuorumSetHash = string;

/**
 * Fetches quorumSets in a sequential way from connected nodes.
 * Makes sure every peerNode that sent an scp message with a hash, gets the correct quorumSet.
 */
export class QuorumSetManager {

    protected quorumSetOwners: Map<QuorumSetHash, Set<PublicKey>> = new Map();
    protected quorumSetRequestedTo: Map<QuorumSetHash, Set<PublicKey>> = new Map();
    protected quorumSetRequests: Map<PublicKey, {
        timeout: NodeJS.Timeout,
        hash: QuorumSetHash
    }> = new Map();
    protected quorumSetRequestHashesInProgress: Set<QuorumSetHash> = new Set();
    protected logger:Logger;

    constructor(logger:P.Logger) {
        this.logger = logger;
    }

    public processQuorumSetHashFromStatement(peer: PeerNode, scpStatement: xdr.ScpStatement, crawlState: CrawlState) {
        peer.quorumSetHash = this.getQuorumSetHash(scpStatement);
        if (!this.getQuorumSetHashOwners(peer.quorumSetHash).has(peer.publicKey)) {
            this.logger.debug({'pk': peer.publicKey, hash: peer.quorumSetHash}, 'Detected new quorumSetHash');
        }

        this.getQuorumSetHashOwners(peer.quorumSetHash).add(peer.publicKey);

        if (crawlState.quorumSets.has(peer.quorumSetHash))
            peer.quorumSet = crawlState.quorumSets.get(peer.quorumSetHash);
        else {
            this.logger.debug({'pk': peer.publicKey}, 'Unknown quorumSet for hash: ' + peer.quorumSetHash);
            this.requestQuorumSet(peer.quorumSetHash, crawlState);
        }
    }

    public processQuorumSet(quorumSet: QuorumSet, sender: PublicKey, crawlState: CrawlState){
        crawlState.quorumSets.set(quorumSet.hashKey!, quorumSet);
        let owners = this.getQuorumSetHashOwners(quorumSet.hashKey!);

        owners.forEach(owner => {
            let peer = crawlState.peerNodes.get(owner);
            if (peer)
                peer.quorumSet = quorumSet;
        });
        this.clearRequestQuorumSet(sender);
    }

    public connectedToPeerNode(peerNode: PeerNode, crawlState: CrawlState){
        if (peerNode.quorumSetHash && !peerNode.quorumSet) {
            this.logger.info({'hash': peerNode.quorumSetHash, 'pk': peerNode.publicKey}, 'Priority request');
            this.quorumSetRequestHashesInProgress.delete(peerNode.quorumSetHash);
            let runningQuorumSetRequest = this.quorumSetRequests.get(peerNode.publicKey);
            if (runningQuorumSetRequest) {
                clearTimeout(runningQuorumSetRequest.timeout);
                this.quorumSetRequests.delete(peerNode.publicKey);
            }
            this.requestQuorumSet(peerNode.quorumSetHash, crawlState);
        }
    }

    public peerNodeDisconnected(publicKey: PublicKey, crawlState: CrawlState){
        let hash = this.clearRequestQuorumSet(publicKey);
        if (hash)
            this.requestQuorumSet(hash, crawlState);
    }

    public peerNodeDoesNotHaveQuorumSet(publicKey: PublicKey, crawlState: CrawlState){
        let hash = this.clearRequestQuorumSet(publicKey);
        if (hash)
            this.requestQuorumSet(hash, crawlState);
    }

    protected requestQuorumSet(quorumSetHash: string, crawlState: CrawlState) {
        if (crawlState.quorumSets.has(quorumSetHash))
            return;

        if (this.quorumSetRequestHashesInProgress.has(quorumSetHash)) {
            this.logger.debug({hash: quorumSetHash}, 'Request already in progress');
            return;
        }

        this.logger.debug({hash: quorumSetHash}, 'Requesting quorumSet');
        let alreadyRequestedTo = this.quorumSetRequestedTo.get(quorumSetHash);
        if (!alreadyRequestedTo) {
            alreadyRequestedTo = new Set();
            this.quorumSetRequestedTo.set(quorumSetHash, alreadyRequestedTo);
        }

        let owners = this.getQuorumSetHashOwners(quorumSetHash);
        let quorumSetMessage = xdr.StellarMessage.getScpQuorumset(Buffer.from(quorumSetHash, 'base64'));

        let sendRequest = (to: PublicKey) => {
            let connection = crawlState.openConnections.get(to);
            if (!connection)
                return;
            alreadyRequestedTo!.add(connection.remotePublicKey!);
            this.quorumSetRequestHashesInProgress.add(quorumSetHash);
            this.logger.info({hash: quorumSetHash}, 'Requesting quorumSet from ' + to);

            connection.sendStellarMessage(quorumSetMessage);
            this.quorumSetRequests.set(to, {
                'timeout': setTimeout(() => {
                    this.logger.info({pk: to, hash: quorumSetHash}, 'Request timeout reached');
                    this.quorumSetRequests.delete(to);
                    this.quorumSetRequestHashesInProgress.delete(quorumSetHash);
                    this.requestQuorumSet(quorumSetHash, crawlState);
                }, 2000), hash: quorumSetHash
            });
        }

        //first try the owners of the hashes
        let notYetRequestedOwnerWithActiveConnection =
            Array.from(owners.keys())
                .filter(owner => !alreadyRequestedTo!.has(owner))
                .find(owner => crawlState.openConnections.has(owner));
        if (notYetRequestedOwnerWithActiveConnection) {
            sendRequest(notYetRequestedOwnerWithActiveConnection);
            return;
        }

        //try other open connections
        let notYetRequestedNonOwnerActiveConnection =
            Array.from(crawlState.openConnections.keys())
                //.filter(publicKey => this.getPeer(publicKey)!.participatingInSCP)
                .find(publicKey => !alreadyRequestedTo!.has(publicKey));

        if (notYetRequestedNonOwnerActiveConnection) {
            sendRequest(notYetRequestedNonOwnerActiveConnection);
            return;
        }

        this.logger.warn({hash: quorumSetHash}, 'No active connections to request quorumSet from');
    }

    protected getQuorumSetHashOwners(quorumSetHash: QuorumSetHash) {
        let quorumSetHashOwners = this.quorumSetOwners.get(quorumSetHash);
        if (!quorumSetHashOwners) {
            quorumSetHashOwners = new Set();
            this.quorumSetOwners.set(quorumSetHash, quorumSetHashOwners);
        }

        return quorumSetHashOwners;
    }

    protected getQuorumSetHash(scpStatement: xdr.ScpStatement) {
        let quorumSetHash: QuorumSetHash;
        switch (scpStatement.pledges().switch()) {
            case xdr.ScpStatementType.scpStExternalize():
                quorumSetHash = scpStatement.pledges().externalize().commitQuorumSetHash().toString('base64');
                break;
            case xdr.ScpStatementType.scpStConfirm():
                quorumSetHash = scpStatement.pledges().confirm().quorumSetHash().toString('base64');
                break;
            case xdr.ScpStatementType.scpStPrepare():
                quorumSetHash = scpStatement.pledges().prepare().quorumSetHash().toString('base64');
                break;
            case xdr.ScpStatementType.scpStNominate():
                quorumSetHash = scpStatement.pledges().nominate().quorumSetHash().toString('base64');
                break;
        }

        return quorumSetHash!;
    }

    protected clearRequestQuorumSet(publicKey: PublicKey) {
        let quorumSetRequest = this.quorumSetRequests.get(publicKey);
        if (!quorumSetRequest)
            return;
        clearTimeout(quorumSetRequest.timeout);
        this.quorumSetRequests.delete(publicKey);
        this.quorumSetRequestHashesInProgress.delete(quorumSetRequest.hash);

        return quorumSetRequest.hash;
    }
}
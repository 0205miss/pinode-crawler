"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.QuorumSetManager = void 0;
const stellar_base_1 = require("stellar-base");
const neverthrow_1 = require("neverthrow");
/**
 * Fetches quorumSets in a sequential way from connected nodes.
 * Makes sure every peerNode that sent an scp message with a hash, gets the correct quorumSet.
 */
class QuorumSetManager {
    constructor(logger) {
        this.logger = logger;
    }
    onNodeDisconnected(publicKey, crawlState) {
        if (!crawlState.quorumSetState.quorumSetRequests.has(publicKey))
            return;
        this.clearQuorumSetRequest(publicKey, crawlState);
    }
    processQuorumSetHashFromStatement(peer, scpStatement, crawlState) {
        const quorumSetHashResult = this.getQuorumSetHash(scpStatement);
        if (quorumSetHashResult.isErr())
            return;
        peer.quorumSetHash = quorumSetHashResult.value;
        if (!this.getQuorumSetHashOwners(peer.quorumSetHash, crawlState).has(peer.publicKey)) {
            this.logger.debug({ pk: peer.publicKey, hash: peer.quorumSetHash }, 'Detected quorumSetHash');
        }
        this.getQuorumSetHashOwners(peer.quorumSetHash, crawlState).add(peer.publicKey);
        if (crawlState.quorumSets.has(peer.quorumSetHash))
            peer.quorumSet = crawlState.quorumSets.get(peer.quorumSetHash);
        else {
            this.logger.debug({ pk: peer.publicKey }, 'Unknown quorumSet for hash: ' + peer.quorumSetHash);
            this.requestQuorumSet(peer.quorumSetHash, crawlState);
        }
    }
    processQuorumSet(quorumSetHash, quorumSet, sender, crawlState) {
        crawlState.quorumSets.set(quorumSetHash, quorumSet);
        const owners = this.getQuorumSetHashOwners(quorumSetHash, crawlState);
        owners.forEach((owner) => {
            const peer = crawlState.peerNodes.get(owner);
            if (peer)
                peer.quorumSet = quorumSet;
        });
        this.clearQuorumSetRequest(sender, crawlState);
    }
    peerNodeDoesNotHaveQuorumSet(peerPublicKey, quorumSetHash, crawlState) {
        const request = crawlState.quorumSetState.quorumSetRequests.get(peerPublicKey);
        if (!request)
            return;
        if (request.hash !== quorumSetHash)
            return;
        this.clearQuorumSetRequest(peerPublicKey, crawlState);
        this.requestQuorumSet(quorumSetHash, crawlState);
    }
    requestQuorumSet(quorumSetHash, crawlState) {
        if (crawlState.quorumSets.has(quorumSetHash))
            return;
        if (crawlState.quorumSetState.quorumSetHashesInProgress.has(quorumSetHash)) {
            this.logger.debug({ hash: quorumSetHash }, 'Request already in progress');
            return;
        }
        this.logger.debug({ hash: quorumSetHash }, 'Requesting quorumSet');
        const alreadyRequestedToResult = crawlState.quorumSetState.quorumSetRequestedTo.get(quorumSetHash);
        const alreadyRequestedTo = alreadyRequestedToResult
            ? alreadyRequestedToResult
            : new Set();
        crawlState.quorumSetState.quorumSetRequestedTo.set(quorumSetHash, alreadyRequestedTo);
        const owners = this.getQuorumSetHashOwners(quorumSetHash, crawlState);
        const quorumSetMessage = stellar_base_1.xdr.StellarMessage.getScpQuorumset(Buffer.from(quorumSetHash, 'base64'));
        const sendRequest = (to) => {
            const connection = crawlState.openConnections.get(to);
            if (!connection || !connection.remotePublicKey)
                return;
            alreadyRequestedTo.add(connection.remotePublicKey);
            this.logger.info({ hash: quorumSetHash }, 'Requesting quorumSet from ' + to);
            connection.sendStellarMessage(quorumSetMessage);
            crawlState.quorumSetState.quorumSetHashesInProgress.add(quorumSetHash);
            crawlState.quorumSetState.quorumSetRequests.set(to, {
                hash: quorumSetHash,
                timeout: setTimeout(() => {
                    this.logger.info({ pk: to, hash: quorumSetHash }, 'Request timeout reached');
                    crawlState.quorumSetState.quorumSetRequests.delete(to);
                    crawlState.quorumSetState.quorumSetHashesInProgress.delete(quorumSetHash);
                    this.requestQuorumSet(quorumSetHash, crawlState);
                }, QuorumSetManager.MS_TO_WAIT_FOR_REPLY)
            });
        };
        //first try the owners of the hashes
        const notYetRequestedOwnerWithActiveConnection = Array.from(owners.keys())
            .filter((owner) => !alreadyRequestedTo.has(owner))
            .find((owner) => crawlState.openConnections.has(owner));
        if (notYetRequestedOwnerWithActiveConnection) {
            sendRequest(notYetRequestedOwnerWithActiveConnection);
            return;
        }
        //try other open connections
        const notYetRequestedNonOwnerActiveConnection = Array.from(crawlState.openConnections.keys()).find((publicKey) => !alreadyRequestedTo.has(publicKey));
        if (notYetRequestedNonOwnerActiveConnection) {
            sendRequest(notYetRequestedNonOwnerActiveConnection);
            return;
        }
        this.logger.warn({ hash: quorumSetHash }, 'No active connections to request quorumSet from');
    }
    getQuorumSetHashOwners(quorumSetHash, crawlState) {
        let quorumSetHashOwners = crawlState.quorumSetState.quorumSetOwners.get(quorumSetHash);
        if (!quorumSetHashOwners) {
            quorumSetHashOwners = new Set();
            crawlState.quorumSetState.quorumSetOwners.set(quorumSetHash, quorumSetHashOwners);
        }
        return quorumSetHashOwners;
    }
    getQuorumSetHash(scpStatement) {
        try {
            let quorumSetHash;
            switch (scpStatement.pledges().switch()) {
                case stellar_base_1.xdr.ScpStatementType.scpStExternalize():
                    quorumSetHash = scpStatement
                        .pledges()
                        .externalize()
                        .commitQuorumSetHash()
                        .toString('base64');
                    break;
                case stellar_base_1.xdr.ScpStatementType.scpStConfirm():
                    quorumSetHash = scpStatement
                        .pledges()
                        .confirm()
                        .quorumSetHash()
                        .toString('base64');
                    break;
                case stellar_base_1.xdr.ScpStatementType.scpStPrepare():
                    quorumSetHash = scpStatement
                        .pledges()
                        .prepare()
                        .quorumSetHash()
                        .toString('base64');
                    break;
                case stellar_base_1.xdr.ScpStatementType.scpStNominate():
                    quorumSetHash = scpStatement
                        .pledges()
                        .nominate()
                        .quorumSetHash()
                        .toString('base64');
                    break;
            }
            if (quorumSetHash)
                return (0, neverthrow_1.ok)(quorumSetHash);
            else
                return (0, neverthrow_1.err)(new Error('Cannot parse quorumSet'));
        }
        catch (e) {
            if (e instanceof Error)
                return (0, neverthrow_1.err)(e);
            else
                return (0, neverthrow_1.err)(new Error('Cannot parse quorumSet'));
        }
    }
    clearQuorumSetRequest(peerPublicKey, crawlState) {
        const result = crawlState.quorumSetState.quorumSetRequests.get(peerPublicKey);
        if (!result)
            return;
        clearTimeout(result.timeout);
        crawlState.quorumSetState.quorumSetRequests.delete(peerPublicKey);
        crawlState.quorumSetState.quorumSetHashesInProgress.delete(result.hash);
    }
}
exports.QuorumSetManager = QuorumSetManager;
QuorumSetManager.MS_TO_WAIT_FOR_REPLY = 1500;
//# sourceMappingURL=quorum-set-manager.js.map
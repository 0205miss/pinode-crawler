"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ScpManager = void 0;
const peer_node_1 = require("./peer-node");
const stellar_base_1 = require("stellar-base");
const js_stellar_node_connector_1 = require("@stellarbeat/js-stellar-node-connector");
const neverthrow_1 = require("neverthrow");
const ledger_validator_1 = require("./ledger-validator");
class ScpManager {
    constructor(quorumSetManager, logger) {
        this.logger = logger;
        this.quorumSetManager = quorumSetManager;
    }
    processScpEnvelope(scpEnvelope, crawlState) {
        if (crawlState.envelopeCache.has(scpEnvelope.signature().toString())) {
            return (0, neverthrow_1.ok)(undefined);
        }
        crawlState.envelopeCache.set(scpEnvelope.signature().toString(), 1);
        if (!(0, ledger_validator_1.isLedgerSequenceValid)(crawlState.latestClosedLedger, BigInt(scpEnvelope.statement().slotIndex().toString())))
            return (0, neverthrow_1.ok)(undefined);
        const verifiedResult = (0, js_stellar_node_connector_1.verifySCPEnvelopeSignature)(scpEnvelope, (0, stellar_base_1.hash)(Buffer.from(stellar_base_1.Networks.PUBLIC)));
        if (verifiedResult.isErr())
            return (0, neverthrow_1.err)(new Error('Invalid SCP Signature'));
        return this.processScpStatement(scpEnvelope.statement(), crawlState);
    }
    processScpStatement(scpStatement, crawlState) {
        const publicKeyResult = (0, js_stellar_node_connector_1.getPublicKeyStringFromBuffer)(scpStatement.nodeId().value());
        if (publicKeyResult.isErr()) {
            return (0, neverthrow_1.err)(publicKeyResult.error);
        }
        const publicKey = publicKeyResult.value;
        const slotIndex = BigInt(scpStatement.slotIndex().toString());
        this.logger.debug({
            publicKey: publicKey,
            slotIndex: slotIndex.toString()
        }, 'processing new scp statement: ' + scpStatement.pledges().switch().name);
        let peer = crawlState.peerNodes.get(publicKey);
        if (!peer) {
            peer = new peer_node_1.PeerNode(publicKey);
            crawlState.peerNodes.set(publicKey, peer);
        }
        peer.latestActiveSlotIndex = slotIndex.toString();
        this.quorumSetManager.processQuorumSetHashFromStatement(peer, scpStatement, crawlState);
        if (scpStatement.pledges().switch().value !==
            stellar_base_1.xdr.ScpStatementType.scpStExternalize().value) {
            //only if node is externalizing, we mark the node as validating
            return (0, neverthrow_1.ok)(undefined);
        }
        return this.processExternalizeStatement(peer, slotIndex, scpStatement.pledges().externalize(), crawlState);
    }
    processExternalizeStatement(peer, slotIndex, statementExternalize, crawlState) {
        const value = statementExternalize.commit().value().toString('base64');
        this.logger.debug({
            publicKey: peer.publicKey,
            slotIndex: slotIndex.toString()
        }, 'externalize msg with value: ' + value);
        const markNodeAsValidating = (peer) => {
            if (!peer.isValidating) {
                this.logger.debug({
                    pk: peer.publicKey
                }, 'Validating');
            }
            peer.isValidating = true;
        };
        const slot = crawlState.slots.getSlot(slotIndex);
        const slotWasClosedBefore = slot.closed();
        slot.addExternalizeValue(peer.publicKey, value);
        if (slot.closed()) {
            if (!slotWasClosedBefore) {
                //we just closed the slot, lets mark all nodes as validating!
                this.logger.info({ ledger: slotIndex.toString() }, 'Ledger closed!');
                if (slotIndex > crawlState.latestClosedLedger.sequence) {
                    crawlState.latestClosedLedger = {
                        sequence: slotIndex,
                        closeTime: new Date()
                    };
                }
                slot
                    .getNodesAgreeingOnExternalizedValue()
                    .forEach((validatingPublicKey) => {
                    const validatingPeer = crawlState.peerNodes.get(validatingPublicKey);
                    if (validatingPeer)
                        markNodeAsValidating(validatingPeer);
                });
                slot.getNodesDisagreeingOnExternalizedValue().forEach((nodeId) => {
                    const badPeer = crawlState.peerNodes.get(nodeId);
                    if (badPeer)
                        badPeer.isValidatingIncorrectValues = true;
                });
            }
            else {
                //if the slot was already closed, we check if this new (?) node should be marked as validating
                if (value === slot.externalizedValue)
                    markNodeAsValidating(peer);
                else
                    peer.isValidatingIncorrectValues = true;
            }
        }
        return (0, neverthrow_1.ok)(undefined);
    }
}
exports.ScpManager = ScpManager;
//# sourceMappingURL=scp-manager.js.map
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isLedgerSequenceValid = void 0;
const MAX_LEDGER_DRIFT = 5; //how many ledgers can a node fall behind
const MAX_CLOSED_LEDGER_PROCESSING_TIME = 90000; //how long in ms we still process messages of closed ledgers.
function isLedgerSequenceValid(latestClosedLedger, ledgerSequence) {
    const latestSequenceDifference = Number(latestClosedLedger.sequence - ledgerSequence);
    if (latestSequenceDifference > MAX_LEDGER_DRIFT)
        return false; //ledger message older than allowed by pure ledger sequence numbers
    return !(ledgerSequence <= latestClosedLedger.sequence &&
        new Date().getTime() - latestClosedLedger.closeTime.getTime() >
            MAX_CLOSED_LEDGER_PROCESSING_TIME);
}
exports.isLedgerSequenceValid = isLedgerSequenceValid;
//# sourceMappingURL=ledger-validator.js.map
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Slots = exports.Slot = void 0;
const containsSlice_1 = require("@stellarbeat/js-stellar-domain/lib/quorum/containsSlice");
const js_stellar_domain_1 = require("@stellarbeat/js-stellar-domain");
class Slot {
    constructor(index, trustedQuorumSet, logger) {
        this.logger = logger;
        this.valuesMap = new Map();
        this.index = index;
        this.trustedQuorumSet = trustedQuorumSet;
    }
    getNodesAgreeingOnExternalizedValue() {
        if (this.externalizedValue === undefined)
            return new Set();
        const nodes = this.valuesMap.get(this.externalizedValue);
        if (!nodes)
            return new Set();
        return nodes;
    }
    getNodesDisagreeingOnExternalizedValue() {
        let nodes = new Set();
        if (this.externalizedValue === undefined)
            return nodes;
        Array.from(this.valuesMap.keys())
            .filter((value) => value !== this.externalizedValue)
            .forEach((value) => {
            const otherNodes = this.valuesMap.get(value);
            if (otherNodes)
                nodes = new Set([...nodes, ...otherNodes]);
        });
        return nodes;
    }
    addExternalizeValue(nodeId, value) {
        let nodesThatExternalizedValue = this.valuesMap.get(value);
        if (!nodesThatExternalizedValue) {
            nodesThatExternalizedValue = new Set();
            this.valuesMap.set(value, nodesThatExternalizedValue);
        }
        if (nodesThatExternalizedValue.has(nodeId))
            //already recorded, no need to check if closed
            return;
        nodesThatExternalizedValue.add(nodeId);
        if (this.closed())
            return;
        if (js_stellar_domain_1.QuorumSet.getAllValidators(this.trustedQuorumSet).includes(nodeId)) {
            if (this.logger) {
                this.logger.debug('Node part of trusted quorumSet, attempting slot close', { node: nodeId });
            }
            if ((0, containsSlice_1.default)(this.trustedQuorumSet, nodesThatExternalizedValue))
                //try to close slot
                this.externalizedValue = value;
        }
    }
    closed() {
        return this.externalizedValue !== undefined;
    }
}
exports.Slot = Slot;
class Slots {
    constructor(trustedQuorumSet, logger) {
        this.logger = logger;
        this.slots = new Map();
        this.trustedQuorumSet = trustedQuorumSet;
    }
    getSlot(slotIndex) {
        let slot = this.slots.get(slotIndex);
        if (!slot) {
            slot = new Slot(slotIndex, this.trustedQuorumSet, this.logger);
            this.slots.set(slotIndex, slot);
        }
        return slot;
    }
    hasClosedSlot() {
        return this.getClosedSlotIndexes().length !== 0;
    }
    getLatestSlotIndex() {
        return Array.from(this.slots.keys()).reduce((l, r) => (r > l ? r : l), BigInt(0));
    }
    getClosedSlotIndexes() {
        return Array.from(this.slots.values())
            .filter((slot) => slot.closed())
            .map((slot) => slot.index);
    }
}
exports.Slots = Slots;
//# sourceMappingURL=slots.js.map
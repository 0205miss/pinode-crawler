import { QuorumSet } from '@stellarbeat/js-stellar-domain';
import * as P from 'pino';
declare type SlotIndex = bigint;
declare type NodeId = string;
declare type SlotValue = string;
export declare class Slot {
    protected logger: P.Logger;
    index: SlotIndex;
    externalizedValue?: SlotValue;
    protected valuesMap: Map<SlotValue, Set<NodeId>>;
    protected trustedQuorumSet: QuorumSet;
    constructor(index: SlotIndex, trustedQuorumSet: QuorumSet, logger: P.Logger);
    getNodesAgreeingOnExternalizedValue(): Set<NodeId>;
    getNodesDisagreeingOnExternalizedValue(): Set<NodeId>;
    addExternalizeValue(nodeId: NodeId, value: SlotValue): void;
    closed(): boolean;
}
export declare class Slots {
    protected logger: P.Logger;
    protected slots: Map<SlotIndex, Slot>;
    protected trustedQuorumSet: QuorumSet;
    constructor(trustedQuorumSet: QuorumSet, logger: P.Logger);
    getSlot(slotIndex: SlotIndex): Slot;
    hasClosedSlot(): boolean;
    getLatestSlotIndex(): bigint;
    getClosedSlotIndexes(): bigint[];
}
export {};

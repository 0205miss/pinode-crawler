/// <reference types="node" />
import { Connection } from '@stellarbeat/js-stellar-node-connector';
import { PublicKey, QuorumSet } from '@stellarbeat/js-stellar-domain';
import { PeerNode } from './peer-node';
import { Ledger } from './crawler';
import { Slots } from './slots';
import * as LRUCache from 'lru-cache';
import * as P from 'pino';
declare type QuorumSetHash = string;
declare type PeerKey = string;
export declare class QuorumSetState {
    quorumSetOwners: Map<QuorumSetHash, Set<PublicKey>>;
    quorumSetRequestedTo: Map<QuorumSetHash, Set<PublicKey>>;
    quorumSetHashesInProgress: Set<QuorumSetHash>;
    quorumSetRequests: Map<PublicKey, {
        timeout: NodeJS.Timeout;
        hash: QuorumSetHash;
    }>;
}
export declare class CrawlState {
    protected logger: P.Logger;
    maxCrawlTimeHit: boolean;
    openConnections: Map<PublicKey, Connection>;
    peerNodes: Map<PublicKey, PeerNode>;
    quorumSets: Map<string, QuorumSet>;
    crawledNodeAddresses: Set<PeerKey>;
    latestClosedLedger: Ledger;
    listenTimeouts: Map<PublicKey, NodeJS.Timeout>;
    slots: Slots;
    envelopeCache: LRUCache<string, number>;
    quorumSetState: QuorumSetState;
    failedConnections: string[];
    constructor(topTierQuorumSet: QuorumSet, quorumSets: Map<string, QuorumSet>, latestClosedLedger: Ledger, logger: P.Logger);
}
export {};

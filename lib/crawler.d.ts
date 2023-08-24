import { QuorumSet } from '@stellarbeat/js-stellar-domain';
import { AsyncResultCallback, QueueObject } from 'async';
import { Connection, Node as NetworkNode } from '@stellarbeat/js-stellar-node-connector';
import { xdr } from 'stellar-base';
import { PeerNode } from './peer-node';
import { NodeInfo } from '@stellarbeat/js-stellar-node-connector/lib/node';
import * as P from 'pino';
import { QuorumSetManager } from './quorum-set-manager';
import { CrawlState } from './crawl-state';
import { ScpManager } from './scp-manager';
import { NodeConfig } from '@stellarbeat/js-stellar-node-connector/lib/node-config';
declare type PublicKey = string;
export declare type NodeAddress = [ip: string, port: number];
export interface CrawlResult {
    peers: Map<PublicKey, PeerNode>;
    closedLedgers: bigint[];
    latestClosedLedger: Ledger;
}
declare type QuorumSetHash = string;
interface CrawlQueueTask {
    nodeAddress: NodeAddress;
    crawlState: CrawlState;
}
export interface Ledger {
    sequence: bigint;
    closeTime: Date;
}
export interface CrawlerConfiguration {
    maxOpenConnections: number;
    nodeConfig: NodeConfig;
    maxCrawlTime: number;
    blackList: Set<PublicKey>;
}
export declare class CrawlerConfiguration implements CrawlerConfiguration {
    nodeConfig: NodeConfig;
    maxOpenConnections: number;
    maxCrawlTime: number;
    blackList: Set<string>;
    constructor(nodeConfig: NodeConfig, maxOpenConnections?: number, maxCrawlTime?: number, blackList?: Set<string>);
}
/**
 * The Crawler manages the connections to every discovered Node Address. If a node is participating in SCP, it keeps listening until it can determine if it is validating correctly.
 */
export declare class Crawler {
    protected quorumSetManager: QuorumSetManager;
    protected scpManager: ScpManager;
    protected crawlerNode: NetworkNode;
    protected logger: P.Logger;
    protected config: CrawlerConfiguration;
    protected crawlQueue: QueueObject<CrawlQueueTask>;
    protected blackList: Set<PublicKey>;
    protected static readonly SCP_LISTEN_TIMEOUT = 6000;
    constructor(config: CrawlerConfiguration, node: NetworkNode, quorumSetManager: QuorumSetManager, scpManager: ScpManager, logger: P.Logger);
    crawl(nodeAddresses: NodeAddress[], topTierQuorumSet: QuorumSet, latestClosedLedger?: Ledger, quorumSets?: Map<QuorumSetHash, QuorumSet>): Promise<CrawlResult>;
    protected crawlPeerNode(nodeAddress: NodeAddress, crawlState: CrawlState): void;
    protected processCrawlPeerNodeInCrawlQueue(crawlQueueTask: CrawlQueueTask, crawlQueueTaskDone: AsyncResultCallback<void>): void;
    protected onTimeout(connection: Connection, crawlState: CrawlState): void;
    protected onConnected(connection: Connection, publicKey: PublicKey, nodeInfo: NodeInfo, crawlState: CrawlState): void;
    protected onStellarMessage(connection: Connection, stellarMessage: xdr.StellarMessage, crawlState: CrawlState): void;
    protected onStellarMessageErrorReceived(connection: Connection, errorMessage: xdr.Error, crawlState: CrawlState): void;
    protected onConnectionClose(connection: Connection, crawlState: CrawlState, crawlQueueTaskDone: AsyncResultCallback<void>): void;
    protected onPeersReceived(connection: Connection, peers: xdr.PeerAddress[], crawlState: CrawlState): void;
    protected onLoadTooHighReceived(connection: Connection, crawlState: CrawlState): void;
    protected onQuorumSetReceived(connection: Connection, quorumSetMessage: xdr.ScpQuorumSet, crawlState: CrawlState): void;
    protected disconnect(connection: Connection, crawlState: CrawlState, error?: Error): void;
    protected listenFurther(peer: PeerNode, timeoutCounter?: number): boolean;
    protected listen(peer: PeerNode, connection: Connection, timeoutCounter: number | undefined, crawlState: CrawlState): void;
    protected wrapUp(resolve: (value: CrawlResult | PromiseLike<CrawlResult>) => void, reject: (error: Error) => void, crawlState: CrawlState): void;
}
export {};

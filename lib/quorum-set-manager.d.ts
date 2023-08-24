import { PublicKey, QuorumSet } from '@stellarbeat/js-stellar-domain';
import * as P from 'pino';
import { Logger } from 'pino';
import { xdr } from 'stellar-base';
import { PeerNode } from './peer-node';
import { CrawlState } from './crawl-state';
import { Result } from 'neverthrow';
declare type QuorumSetHash = string;
/**
 * Fetches quorumSets in a sequential way from connected nodes.
 * Makes sure every peerNode that sent an scp message with a hash, gets the correct quorumSet.
 */
export declare class QuorumSetManager {
    protected logger: Logger;
    static MS_TO_WAIT_FOR_REPLY: number;
    constructor(logger: P.Logger);
    onNodeDisconnected(publicKey: PublicKey, crawlState: CrawlState): void;
    processQuorumSetHashFromStatement(peer: PeerNode, scpStatement: xdr.ScpStatement, crawlState: CrawlState): void;
    processQuorumSet(quorumSetHash: QuorumSetHash, quorumSet: QuorumSet, sender: PublicKey, crawlState: CrawlState): void;
    peerNodeDoesNotHaveQuorumSet(peerPublicKey: PublicKey, quorumSetHash: QuorumSetHash, crawlState: CrawlState): void;
    protected requestQuorumSet(quorumSetHash: QuorumSetHash, crawlState: CrawlState): void;
    protected getQuorumSetHashOwners(quorumSetHash: QuorumSetHash, crawlState: CrawlState): Set<string>;
    protected getQuorumSetHash(scpStatement: xdr.ScpStatement): Result<QuorumSetHash, Error>;
    protected clearQuorumSetRequest(peerPublicKey: PublicKey, crawlState: CrawlState): void;
}
export {};

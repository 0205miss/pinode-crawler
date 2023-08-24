import * as P from 'pino';
import { PeerNode } from './peer-node';
import { xdr } from 'stellar-base';
import { CrawlState } from './crawl-state';
import { QuorumSetManager } from './quorum-set-manager';
import { Result } from 'neverthrow';
export declare class ScpManager {
    protected logger: P.Logger;
    protected quorumSetManager: QuorumSetManager;
    constructor(quorumSetManager: QuorumSetManager, logger: P.Logger);
    processScpEnvelope(scpEnvelope: xdr.ScpEnvelope, crawlState: CrawlState): Result<undefined, Error>;
    protected processScpStatement(scpStatement: xdr.ScpStatement, crawlState: CrawlState): Result<undefined, Error>;
    protected processExternalizeStatement(peer: PeerNode, slotIndex: bigint, statementExternalize: xdr.ScpStatementExternalize, crawlState: CrawlState): Result<undefined, Error>;
}

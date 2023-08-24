import { QuorumSet } from '@stellarbeat/js-stellar-domain';
import { NodeInfo } from '@stellarbeat/js-stellar-node-connector/lib/node';
export declare class PeerNode {
    ip?: string;
    port?: number;
    publicKey: string;
    nodeInfo?: NodeInfo;
    isValidating: boolean;
    isValidatingIncorrectValues: boolean;
    overLoaded: boolean;
    quorumSetHash: string | undefined;
    quorumSet: QuorumSet | undefined;
    suppliedPeerList: boolean;
    latestActiveSlotIndex?: string;
    constructor(publicKey: string);
    get key(): string;
    get participatingInSCP(): boolean;
    get successfullyConnected(): boolean;
}

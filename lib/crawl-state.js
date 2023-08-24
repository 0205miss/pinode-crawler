"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CrawlState = exports.QuorumSetState = void 0;
const slots_1 = require("./slots");
const LRUCache = require("lru-cache");
class QuorumSetState {
    constructor() {
        this.quorumSetOwners = new Map();
        this.quorumSetRequestedTo = new Map();
        this.quorumSetHashesInProgress = new Set();
        this.quorumSetRequests = new Map();
    }
}
exports.QuorumSetState = QuorumSetState;
class CrawlState {
    constructor(topTierQuorumSet, quorumSets, latestClosedLedger, logger) {
        this.logger = logger;
        this.maxCrawlTimeHit = false;
        this.openConnections = new Map();
        this.peerNodes = new Map();
        this.crawledNodeAddresses = new Set();
        this.latestClosedLedger = {
            sequence: BigInt(0),
            closeTime: new Date(0)
        };
        this.listenTimeouts = new Map();
        this.quorumSetState = new QuorumSetState();
        this.failedConnections = [];
        this.quorumSets = quorumSets;
        this.latestClosedLedger = latestClosedLedger;
        this.slots = new slots_1.Slots(topTierQuorumSet, logger);
        this.envelopeCache = new LRUCache(5000);
    }
}
exports.CrawlState = CrawlState;
//# sourceMappingURL=crawl-state.js.map
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createCrawler = exports.jsonStorage = exports.PeerNode = exports.CrawlerConfiguration = exports.Crawler = void 0;
const crawler_1 = require("./crawler");
const P = require("pino");
const quorum_set_manager_1 = require("./quorum-set-manager");
const scp_manager_1 = require("./scp-manager");
const js_stellar_node_connector_1 = require("@stellarbeat/js-stellar-node-connector");
var crawler_2 = require("./crawler");
Object.defineProperty(exports, "Crawler", { enumerable: true, get: function () { return crawler_2.Crawler; } });
Object.defineProperty(exports, "CrawlerConfiguration", { enumerable: true, get: function () { return crawler_2.CrawlerConfiguration; } });
var peer_node_1 = require("./peer-node");
Object.defineProperty(exports, "PeerNode", { enumerable: true, get: function () { return peer_node_1.PeerNode; } });
var json_storage_1 = require("./json-storage");
Object.defineProperty(exports, "jsonStorage", { enumerable: true, get: function () { return json_storage_1.default; } });
function createCrawler(config, logger) {
    if (!logger) {
        logger = P({
            level: process.env.LOG_LEVEL || 'info',
            base: undefined
        });
    }
    const quorumSetManager = new quorum_set_manager_1.QuorumSetManager(logger);
    const node = (0, js_stellar_node_connector_1.createNode)(config.nodeConfig, logger);
    return new crawler_1.Crawler(config, node, quorumSetManager, new scp_manager_1.ScpManager(quorumSetManager, logger), logger);
}
exports.createCrawler = createCrawler;
//# sourceMappingURL=index.js.map
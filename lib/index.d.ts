import { Crawler, CrawlerConfiguration } from './crawler';
import * as P from 'pino';
export { Crawler, CrawlerConfiguration } from './crawler';
export { PeerNode } from './peer-node';
export { default as jsonStorage } from './json-storage';
export declare function createCrawler(config: CrawlerConfiguration, logger?: P.Logger): Crawler;

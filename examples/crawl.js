const jsonStorage = require('../lib').jsonStorage;
const blocked = require('blocked-at');
const { QuorumSet } = require('@stellarbeat/js-stellar-domain');
const { createCrawler } = require('../lib');
const { getConfigFromEnv } = require('@stellarbeat/js-stellar-node-connector');


const NetConfig = {
	network: 'Pi Testnet',
		nodeInfo: {
			ledgerVersion: 19,
			overlayMinVersion: 18,
			overlayVersion: 19,
			versionString: 'v15.3.0'
		},
		listeningPort: 11625,
		privateKey: undefined,
		receiveSCPMessages: true,
		receiveTransactionMessages: true,
		maxFloodMessageCapacity: 2000
}
// noinspection JSIgnoredPromiseFromCall
main();

async function main() {

	let nodesJsonPath = 'seed/nodes.json';

	console.log('[MAIN] Reading NODES.JSON_PATH');
	let nodes = await jsonStorage.getNodesFromFile(nodesJsonPath);

	console.log('[MAIN] Crawl!');
	let trustedQSet = new QuorumSet(2, [
		'GCGB2S2KGYARPVIA37HYZXVRM2YZUEXA6S33ZU5BUDC6THSB62LZSTYH',
		'GABMKJM6I25XI4K7U6XWMULOUQIQ27BCTMLS6BYYSOWKTBUXVRJSXHYQ',
		'GCM6QMP3DLRPTAZW2UZPCPX2LF3SXWXKPMP3GKFZBDSF3QZGV2G5QSTK'
	]);

	let myCrawler = createCrawler({
		nodeConfig: getConfigFromEnv(),
		maxOpenConnections: 50,
		maxCrawlTime: 900000,
		blackList: new Set()
	});

	try {
		let knownQuorumSets = new Map();
		nodes.forEach((node) => {
			knownQuorumSets.set(node.quorumSetHashKey, node.quorumSet);
		});

		let result = await myCrawler.crawl(
			nodes
				.filter((node) => node.publicKey)
				.map((node) => [node.ip, node.port]),
			trustedQSet,
			{
				sequence: BigInt(0),
				closeTime: new Date(0)
			}
		);
		console.log(
			'[MAIN] Writing results to file nodes.json in directory crawl_result'
		);
		await jsonStorage.writeFilePromise(
			'./crawl_result/nodes.json',
			JSON.stringify(Array.from(result.peers.values()))
		);

		console.log('[MAIN] Finished');
	} catch (e) {
		console.log(e);
	}
}

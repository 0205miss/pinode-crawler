const jsonStorage = require('../lib').jsonStorage;
const blocked = require('blocked-at');
const { QuorumSet } = require('@stellarbeat/js-stellar-domain');
const { createCrawler } = require('../lib');
const nodes = require('../crawl_result/resultV1.json')

const NetConfig = {
	network: 'Pi Testnet',
		nodeInfo: {
			ledgerVersion: 15,
			overlayMinVersion: 14,
			overlayVersion: 15,
			versionString: 'stellar-core 15.3.0 (6b99ef893c7f13f22c7c72a7f66ea912aeb4ad73)'
		},
		listeningPort: 31402,
		privateKey: undefined,
		receiveSCPMessages: true,
		receiveTransactionMessages: true,
		maxFloodMessageCapacity: 2000
}

// noinspection JSIgnoredPromiseFromCall
main();

async function main() {

    console.log('[MAIN] Reading NODES.JSON_PATH')
	console.log('[MAIN] Crawl!');
	let trustedQSet = new QuorumSet(51, [
		'GC6R2IQ7LAEWFFNV2ZMXPMOLGGCFRFX6NQFCNT2PLB3KVJPHTIYV4ZPR',
		'GDRIZZC5PNZ6XBJTBZX52WX4NQ2K4Y5XBKVBRYNFDDS4VO6POQ3IGZCL',
		'GAKI7FNXWIJHKV4CKFSU6KDNFTPYAUOP2WIKL5IFSOPEUSYK4Y3LWMXX'
	]);

	let myCrawler = createCrawler({
		nodeConfig: NetConfig,
		maxOpenConnections: 200,
		maxCrawlTime: 900000,
		blackList: new Set()
	});

	try {

		let result = await myCrawler.crawl(
			nodes
			.filter((node) => node.publicKey)
			.map((node) => [node.ip, node.port]),
			trustedQSet,
			{
				sequence: BigInt(13363242),
				closeTime: new Date('2023-08-11T05:49:46Z')
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

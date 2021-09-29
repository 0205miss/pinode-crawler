import {
	Node as NetworkNode,
	Connection,
	createSCPEnvelopeSignature
} from '@stellarbeat/js-stellar-node-connector';
import { CrawlerFactory } from '../src';
import { xdr, Keypair, hash, Networks } from 'stellar-base';
import { QuorumSet } from '@stellarbeat/js-stellar-domain';
import { NodeConfig } from '@stellarbeat/js-stellar-node-connector/lib/node-config';
import { NodeAddress } from '../src/crawler';
import { ok, Result, err } from 'neverthrow';

jest.setTimeout(10000);

let peerNodeAddress: NodeAddress;
let peerNetworkNode: NetworkNode;

let crawledPeerNetworkNode: NetworkNode;
let crawledPeerNodeAddress: NodeAddress;

let qSet: xdr.ScpQuorumSet;
beforeAll(() => {
	peerNodeAddress = ['127.0.0.1', 11621];
	peerNetworkNode = getListeningPeerNode(peerNodeAddress);
	crawledPeerNodeAddress = ['127.0.0.1', 11622];
	crawledPeerNetworkNode = getListeningPeerNode(crawledPeerNodeAddress);
	qSet = new xdr.ScpQuorumSet({
		threshold: 1,
		validators: [
			xdr.PublicKey.publicKeyTypeEd25519(
				crawledPeerNetworkNode.keyPair.rawPublicKey()
			),
			xdr.PublicKey.publicKeyTypeEd25519(peerNetworkNode.keyPair.rawPublicKey())
		],
		innerSets: []
	});
});

afterAll((done) => {
	let counter = 0;

	const cleanup = () => {
		counter++;
		if (counter === 2) {
			done();
		}
	};
	peerNetworkNode.stopAcceptingIncomingConnections(cleanup);
	crawledPeerNetworkNode.stopAcceptingIncomingConnections(cleanup);
});

it('should crawl, listen for validating nodes and harvest quorumSets', async () => {
	peerNetworkNode.on('connection', (connection: Connection) => {
		connection.on('connect', () => {
			const peerAddress = new xdr.PeerAddress({
				ip: xdr.PeerAddressIp.iPv4(Buffer.from([127, 0, 0, 1])),
				port: crawledPeerNodeAddress[1],
				numFailures: 0
			});
			const peers = xdr.StellarMessage.peers([peerAddress]);
			connection.sendStellarMessage(peers);
			const externalizeResult = createExternalizeMessage(peerNetworkNode);
			if (externalizeResult.isOk()) {
				connection.sendStellarMessage(externalizeResult.value, (error) => {
					if (error) console.log(error);
				});
			} else console.log(externalizeResult.error);
		});
		connection.on('data', (stellarMessage: xdr.StellarMessage) => {
			switch (stellarMessage.switch()) {
				case xdr.MessageType.getScpQuorumset(): {
					const dontHave = new xdr.DontHave({
						reqHash: stellarMessage.qSetHash(),
						type: xdr.MessageType.getScpQuorumset()
					});
					const dontHaveMessage = xdr.StellarMessage.dontHave(dontHave);
					connection.sendStellarMessage(dontHaveMessage);
				}
			}
		});
		connection.on('error', (error: Error) => console.log(error));

		connection.on('close', () => {
			return;
		});
		connection.on('end', (error?: Error) => {
			connection.destroy(error);
		});
	});
	peerNetworkNode.on('close', () => {
		console.log('seed peer server close');
	});

	crawledPeerNetworkNode.on('connection', (connection: Connection) => {
		connection.on('connect', () => {
			const externalizeResult = createExternalizeMessage(
				crawledPeerNetworkNode
			);
			if (externalizeResult.isOk()) {
				connection.sendStellarMessage(externalizeResult.value, (error) => {
					if (error) console.log(error);
				});
			}
		});
		connection.on('data', (stellarMessage: xdr.StellarMessage) => {
			switch (stellarMessage.switch()) {
				case xdr.MessageType.getScpQuorumset(): {
					const qSetMessage = xdr.StellarMessage.scpQuorumset(qSet);
					connection.sendStellarMessage(qSetMessage);
				}
			}
		});
		connection.on('error', (error: Error) => console.log(error));

		connection.on('close', () => {
			return;
		});
		connection.on('end', (error?: Error) => {
			connection.destroy(error);
		});
	});
	crawledPeerNetworkNode.on('close', () => {
		console.log('crawled peer server close');
	});

	const trustedQSet = new QuorumSet('hash', 2, [
		peerNetworkNode.keyPair.publicKey(),
		crawledPeerNetworkNode.keyPair.publicKey()
	]);

	const crawler = CrawlerFactory.createCrawler({
		usePublicNetwork: true,
		maxOpenConnections: 20
	});
	const result = await crawler.crawl([peerNodeAddress], trustedQSet);
	const peerNode = result.peers.get(peerNetworkNode.keyPair.publicKey());
	expect(peerNode).toBeDefined();
	if (!peerNode) return;
	const crawledPeerNode = result.peers.get(
		crawledPeerNetworkNode.keyPair.publicKey()
	);
	expect(peerNode.successfullyConnected).toBeTruthy();
	expect(peerNode.isValidating).toBeTruthy();
	expect(peerNode.overLoaded).toBeFalsy();
	expect(peerNode.participatingInSCP).toBeTruthy();
	expect(peerNode.latestActiveSlotIndex).toEqual('1');
	expect(peerNode.suppliedPeerList).toBeTruthy();
	expect(peerNode.quorumSetHash).toEqual(hash(qSet.toXDR()).toString('base64'));
	expect(peerNode.quorumSet).toBeDefined();
	expect(crawledPeerNode).toBeDefined();
	if (!crawledPeerNode) return;
	expect(crawledPeerNode.quorumSetHash).toEqual(
		hash(qSet.toXDR()).toString('base64')
	);
	expect(crawledPeerNode.quorumSet).toBeDefined();
	expect(crawledPeerNode.isValidating).toBeTruthy();
	expect(crawledPeerNode.participatingInSCP).toBeTruthy();
	expect(crawledPeerNode.latestActiveSlotIndex).toEqual('1');
});

function createExternalizeMessage(
	node: NetworkNode
): Result<xdr.StellarMessage, Error> {
	const commit = new xdr.ScpBallot({ counter: 1, value: Buffer.alloc(32) });
	const externalize = new xdr.ScpStatementExternalize({
		commit: commit,
		nH: 1,
		commitQuorumSetHash: hash(qSet.toXDR())
	});
	const pledges = xdr.ScpStatementPledges.scpStExternalize(externalize);

	const statement = new xdr.ScpStatement({
		nodeId: xdr.PublicKey.publicKeyTypeEd25519(node.keyPair.rawPublicKey()),
		slotIndex: xdr.Uint64.fromString('1'),
		pledges: pledges
	});
	const signatureResult = createSCPEnvelopeSignature(
		statement,
		node.keyPair.rawPublicKey(),
		node.keyPair.rawSecretKey(),
		hash(Buffer.from(Networks.PUBLIC))
	);
	if (signatureResult.isOk()) {
		const envelope = new xdr.ScpEnvelope({
			statement: statement,
			signature: signatureResult.value
		});
		const message = xdr.StellarMessage.scpMessage(envelope);
		return ok(message);
	}
	return err(signatureResult.error);
}

function getListeningPeerNode(address: NodeAddress) {
	const peerNodeConfig: NodeConfig = {
		nodeInfo: {
			ledgerVersion: 1,
			overlayMinVersion: 1,
			overlayVersion: 1,
			versionString: '1'
		},
		listeningPort: address[1],
		privateKey: Keypair.random().secret(),
		receiveSCPMessages: true,
		receiveTransactionMessages: false
	};
	const peerNetworkNode = new NetworkNode(true, peerNodeConfig);
	peerNetworkNode.acceptIncomingConnections(address[1], address[0]);

	return peerNetworkNode;
}

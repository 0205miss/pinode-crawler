import * as P from 'pino';
import { hash, xdr } from '@stellar/stellar-base';
import { CrawlState } from './crawl-state';
import {
	getPublicKeyStringFromBuffer,
	verifySCPEnvelopeSignature
} from '@stellarbeat/js-stellar-node-connector';
import { QuorumSetManager } from './quorum-set-manager';
import { err, ok, Result } from 'neverthrow';
import { isLedgerSequenceValid } from './ledger-validator';
import { ExternalizeStatementHandler } from './externalize-statement-handler';

export class ScpEnvelopeHandler {
	constructor(
		private quorumSetManager: QuorumSetManager,
		private externalizeStatementHandler: ExternalizeStatementHandler,
		private logger: P.Logger
	) {}

	public processScpEnvelope(
		scpEnvelope: xdr.ScpEnvelope,
		crawlState: CrawlState
	): Result<undefined, Error> {
		if (crawlState.envelopeCache.has(scpEnvelope.signature().toString())) {
			return ok(undefined);
		}
		crawlState.envelopeCache.set(scpEnvelope.signature().toString(), 1);

		if (
			!isLedgerSequenceValid(
				crawlState.latestClosedLedger,
				BigInt(scpEnvelope.statement().slotIndex().toString())
			)
		)
			return ok(undefined);

		const verifiedResult = verifySCPEnvelopeSignature(
			scpEnvelope,
			hash(Buffer.from(crawlState.network))
		);
		if (verifiedResult.isErr())
			return err(new Error('Error verifying SCP Signature'));

		if (!verifiedResult.value) return err(new Error('Invalid SCP Signature'));

		return this.processScpStatement(scpEnvelope.statement(), crawlState);
	}

	protected processScpStatement(
		scpStatement: xdr.ScpStatement,
		crawlState: CrawlState
	): Result<undefined, Error> {
		const publicKeyResult = getPublicKeyStringFromBuffer(
			scpStatement.nodeId().value()
		);
		if (publicKeyResult.isErr()) {
			return err(publicKeyResult.error);
		}

		const publicKey = publicKeyResult.value;
		const slotIndex = BigInt(scpStatement.slotIndex().toString());

		this.logger.debug(
			{
				publicKey: publicKey,
				slotIndex: slotIndex.toString()
			},
			'processing new scp statement: ' + scpStatement.pledges().switch().name
		);

		const peer = crawlState.peerNodes.addIfNotExists(publicKey);
		peer.participatingInSCP = true;
		peer.latestActiveSlotIndex = slotIndex.toString();

		this.quorumSetManager.processQuorumSetHashFromStatement(
			peer,
			scpStatement,
			crawlState
		);

		if (
			scpStatement.pledges().switch().value !==
			xdr.ScpStatementType.scpStExternalize().value
		) {
			//only if node is externalizing, we mark the node as validating
			return ok(undefined);
		}

		return this.externalizeStatementHandler.handle(
			peer,
			slotIndex,
			scpStatement.pledges().externalize(),
			crawlState
		);
	}
}

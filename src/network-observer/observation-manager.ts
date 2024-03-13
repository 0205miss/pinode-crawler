import { NodeAddress } from '../node-address';
import { StragglerTimer } from './straggler-timer';
import { ConnectionManager } from './connection-manager';
import { P } from 'pino';
import { Ledger } from '../crawler';
import { ConsensusTimer } from './consensus-timer';
import { Observation } from './observation';

export class ObservationManager {
	constructor(
		private connectionManager: ConnectionManager,
		private consensusTimer: ConsensusTimer,
		private stragglerTimer: StragglerTimer,
		private logger: P.Logger
	) {}

	public startSync(observation: Observation): void {
		this.logger.info('Moving to syncing state');
		observation.moveToSyncingState();

		this.connectToTopTierNodes(observation.topTierAddresses);
	}

	public syncCompleted(observation: Observation) {
		this.logger.info('Moving to synced state');
		observation.moveToSyncedState();
		this.startNetworkConsensusTimer(observation);
	}

	public ledgerCloseConfirmed(observation: Observation, ledger: Ledger) {
		observation.ledgerCloseConfirmed(ledger);
		this.stragglerTimer.startStragglerTimeoutForActivePeers(
			false,
			observation.topTierAddressesSet
		);

		this.startNetworkConsensusTimer(observation);
	}

	private startNetworkConsensusTimer(observation: Observation) {
		const onNetworkHaltedCallback = () => {
			this.logger.info('Network consensus timeout');
			observation.networkHalted = true;
			this.stragglerTimer.startStragglerTimeoutForActivePeers(
				false,
				observation.topTierAddressesSet
			);
		};
		this.startNetworkConsensusTimerInternal(onNetworkHaltedCallback);
	}

	public moveToStoppingState(
		observation: Observation,
		doneCallback: () => void
	) {
		this.logger.info('Moving to stopping state');
		observation.moveToStoppingState();

		this.consensusTimer.stop();
		if (this.connectionManager.getActiveConnectionAddresses().length === 0) {
			return this.moveToStoppedState(observation, doneCallback);
		}

		this.stragglerTimer.startStragglerTimeoutForActivePeers(
			true,
			observation.topTierAddressesSet,
			() => this.moveToStoppedState(observation, doneCallback)
		);
	}

	public moveToStoppedState(observation: Observation, onStopped: () => void) {
		this.logger.info('Moving to stopped state');
		observation.moveToStoppedState();

		this.stragglerTimer.stopStragglerTimeouts(); //a node could have disconnected during the straggler timeout
		this.connectionManager.shutdown();

		onStopped();
	}

	private startNetworkConsensusTimerInternal(onNetworkHalted: () => void) {
		this.consensusTimer.start(onNetworkHalted);
	}

	private connectToTopTierNodes(topTierNodes: NodeAddress[]) {
		topTierNodes.forEach((address) => {
			this.connectionManager.connectToNode(address[0], address[1]);
		});
	}
}

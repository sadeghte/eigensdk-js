import {Logger} from 'winston'
import { Operator } from '../../../services/avsregistry/avsregistry.js';
import { 
	Contract, 
	Web3, 
	Address, 
	TransactionReceipt
} from "web3";
// import {TxReceipt, LocalAccount } from "web3";
import * as ABIs from '../../../contracts/ABIs.js'
import {sendTransaction} from "../../utils.js";
import { ELReader } from './reader.js';
import { LocalAccount } from '../../../types/general.js';


class ELWriter {
	constructor(
		private readonly slasher: Contract<typeof ABIs.SLASHER>,
		private readonly delegationManager: Contract<typeof ABIs.DELEGATION_MANAGER>,
		private readonly strategyManager: Contract<typeof ABIs.STRATEGY_MANAGER>,
		private readonly strategyManagerAddr: Address,
		private readonly avsDirectory: Contract<typeof ABIs.AVS_DIRECTORY>,
		private readonly elReader: ELReader,
		private readonly logger: Logger,
		private readonly ethHttpClient: Web3,
		private readonly pkWallet: LocalAccount,
	) {}

	async registerAsOperator(operator: Operator): Promise<TransactionReceipt | null> {
		this.logger.info(`Registering operator ${operator.address} to EigenLayer`);

		const opDetails: {
		earningsReceiver: string;
		stakerOptOutWindowBlocks?: number;
		delegationApprover: string;
		} = {
		earningsReceiver: Web3.utils.toChecksumAddress(operator.earningsReceiverAddress),
		stakerOptOutWindowBlocks: operator.stakerOptOutWindowBlocks,
		delegationApprover: Web3.utils.toChecksumAddress(operator.delegationApproverAddress),
		};

		const func = this.delegationManager.methods.registerAsOperator(opDetails, operator.metadataUrl);

		try {
			const receipt = sendTransaction(func, this.pkWallet, this.ethHttpClient);
			return receipt;
		} catch (e) {
			this.logger.error(e);
			return null;
		}
	}

	async updateOperatorDetails(operator: Operator): Promise<TransactionReceipt | null> {
		this.logger.info(`Updating operator details of operator ${operator.address} to EigenLayer`);

		const opDetails: {
			earningsReceiver: string;
			delegationApprover: string;
			stakerOptOutWindowBlocks?: number;
		} = {
			earningsReceiver: Web3.utils.toChecksumAddress(operator.earningsReceiverAddress),
			delegationApprover: Web3.utils.toChecksumAddress(operator.delegationApproverAddress),
			stakerOptOutWindowBlocks: operator.stakerOptOutWindowBlocks,
		};

		let receipt: TransactionReceipt | null = null;

		try {
			// Update operator details
			receipt = await sendTransaction(this.delegationManager.methods.modifyOperatorDetails(opDetails), this.pkWallet, this.ethHttpClient);
		} catch (e) {
			this.logger.error(e);
			return null;
		}

		if (receipt) {
			this.logger.info("Successfully updated operator details", {
				txHash: receipt.transactionHash?.hex(),
				operator: operator.address,
			});
		}

		try {
			// Update operator metadata URI (if successful)
			receipt = await sendTransaction(this.delegationManager.methods.updateOperatorMetadataURI(operator.metadata_url), this.pkWallet, this.ethHttpClient);
		} catch (e) {
			this.logger.error(e);
			return null;
		}

		if (receipt) {
			this.logger.info("Successfully updated operator metadata URI", {
				txHash: receipt.transactionHash?.hex(),
				operator: operator.address,
			});
		}

		return receipt;
	}

	async depositErc20IntoStrategy(strategyAddr: Address, amount: number): Promise<TransactionReceipt | null> {
		this.logger.info(`Depositing ${amount} tokens into strategy ${strategyAddr}`);

		let underlyingTokenContract: Contract<typeof ABIs.ERC20> | undefined;
		let underlyingTokenAddr: Address | undefined;

		try {
			const [strategy, token] = this.elReader.getStrategyAndUnderlyingErc20Token(strategyAddr);
			underlyingTokenContract = token;
			underlyingTokenAddr = token.address;
		} catch (e) {
			this.logger.error(e);
			return null;
		}

		if (!underlyingTokenContract || !underlyingTokenAddr) {
			this.logger.error('Failed to retrieve underlying token information');
			return null;
		}

		const approveFunc = underlyingTokenContract.methods.approve(this.strategyManagerAddr, amount);

		try {
			await sendTransaction(approveFunc, this.pkWallet, this.ethHttpClient);
		} catch (error) {
			this.logger.error(error);
			return null;
		}

		const depositFunc = this.strategyManager.methods.depositIntoStrategy(strategyAddr, underlyingTokenAddr, amount);

		try {
			const receipt = await sendTransaction(depositFunc, this.pkWallet, this.ethHttpClient);
			this.logger.info('Successfully deposited the token into the strategy', {
				txHash: receipt.transactionHash,
				strategy: strategyAddr,
				token: underlyingTokenAddr,
				amount,
			});
			return receipt;
		} catch (error) {
			this.logger.error(error);
			return null;
		}
	}
}

import { Address, Contract, Web3 } from 'web3';
import {Logger} from 'winston'
import * as ABIs from '../../../contracts/ABIs.js'
import * as utils from '../../utils.js'
import { OperatorStateRetrieverOperator } from '../../../services/avsregistry/avsregistry.js';
import { Uint8 } from '../../../types/general.js';

export class AvsRegistryReader {
    private logger: Logger;
    private blsApkRegistryAddr: Address;
    private blsApkRegistry: Contract<typeof ABIs.BLS_APK_REGISTRY>;
    private registryCoordinatorAddr: Address;
    private registryCoordinator: Contract<typeof ABIs.REGISTRY_COORDINATOR>;
    private operatorStateRetriever: Contract<typeof ABIs.OPERATOR_STATE_RETRIEVER>;
    private stakeRegistry: Contract<typeof ABIs.STAKE_REGISTRY>;
    private ethHttpClient: Web3;
    private ethWsClient: Web3;

    constructor(
        registryCoordinatorAddr: Address,
        registryCoordinator: Contract<typeof ABIs.REGISTRY_COORDINATOR>,
        blsApkRegistryAddr: Address,
        blsApkRegistry: Contract<typeof ABIs.BLS_APK_REGISTRY>,
        operatorStateRetriever: Contract<typeof ABIs.OPERATOR_STATE_RETRIEVER>,
        stakeRegistry: Contract<typeof ABIs.STAKE_REGISTRY>,
        logger: Logger,
        ethHttpClient: Web3,
        ethWsClient: Web3
    ) {
        this.logger = logger;
        this.blsApkRegistryAddr = blsApkRegistryAddr;
        this.blsApkRegistry = blsApkRegistry;
        this.registryCoordinatorAddr = registryCoordinatorAddr;
        this.registryCoordinator = registryCoordinator;
        this.operatorStateRetriever = operatorStateRetriever;
        this.stakeRegistry = stakeRegistry;
        this.ethHttpClient = ethHttpClient;
        this.ethWsClient = ethWsClient;
    }

    async getQuorumCount(): Promise<number> {
        return await this.registryCoordinator.methods.quorumCount().call();
    }

    async getOperatorsStakeInQuorumsAtCurrentBlock(quorumNumbers: Uint8[]): Promise<OperatorStateRetrieverOperator[][]> {
        const curBlock = await this.ethHttpClient.eth.getBlockNumber();
        if (curBlock > Math.pow(2, 32) - 1) {
            throw new Error("Current block number is too large to be converted to uint32");
        }
        return await this.getOperatorsStakeInQuorumsAtBlock(quorumNumbers, Number(curBlock));
    }

    async getOperatorsStakeInQuorumsAtBlock(quorumNumbers: Uint8[], blockNumber: number): Promise<OperatorStateRetrieverOperator[][]> {
        const operatorStakes = await this.operatorStateRetriever.methods.getOperatorState(
            this.registryCoordinatorAddr,
            utils.numsToBytes(quorumNumbers),
            blockNumber
        ).call();
        return operatorStakes.map((quorum: any) => 
            quorum.map((operator: any) => ({
                operator: operator[0],
                operatorId: `0x${operator[1].toString('hex')}`,
                stake: operator[2]
            }))
        );
    }

    async getOperatorAddrsInQuorumsAtCurrentBlock(quorumNumbers: Uint8[]): Promise<Address[][]> {
        const curBlock = await this.ethHttpClient.eth.getBlockNumber();
        if (curBlock > Math.pow(2, 32) - 1) {
            throw new Error("Current block number is too large to be converted to uint32");
        }

        const operatorStakes = this.operatorStateRetriever.methods.getOperatorState(
            this.registryCoordinatorAddr,
            utils.numsToBytes(quorumNumbers),
            curBlock
        ).call();
        return operatorStakes.map((quorum: any) => 
            quorum.map((operator: any) => operator[0])
        );
    }

    async getOperatorsStakeInQuorumsOfOperatorAtBlock(operatorId: BigInt, blockNumber: number): Promise<[number[], OperatorStateRetrieverOperator[][]]> {
        const [quorumBitmap, operatorStakes] = await this.operatorStateRetriever.methods.getOperatorState(
            this.registryCoordinatorAddr,
            operatorId,
            blockNumber
        ).call();

        const quorums = utils.bitmapToQuorumIds(quorumBitmap);
        const operatorStakesFormatted = operatorStakes.map((quorum: any) => 
            quorum.map((operator: any) => ({
                operator: operator[0],
                operatorId: `0x${operator[1].toString('hex')}`,
                stake: operator[2]
            }))
        );

        return [quorums, operatorStakesFormatted];
    }

    async getOperatorsStakeInQuorumsOfOperatorAtCurrentBlock(operatorId: BigInt): Promise<[number[], OperatorStateRetrieverOperator[][]]> {
        const curBlock = await this.ethHttpClient.eth.getBlockNumber();
        if (curBlock > Math.pow(2, 32) - 1) {
            throw new Error("Current block number is too large to be converted to uint32");
        }
        return this.getOperatorsStakeInQuorumsOfOperatorAtBlock(operatorId, Number(curBlock));
    }

    async getOperatorStakeInQuorumsOfOperatorAtCurrentBlock(operatorId: Buffer): Record<number, number> {
        const quorumBitmap = this.registryCoordinator.methods.getCurrentQuorumBitmap(operatorId).call();
        const quorums = utils.bitmapToQuorumIds(quorumBitmap);
        const quorumStakes: Record<number, number> = {};
        for (const quorum of quorums) {
            const stake = this.stakeRegistry.methods.getCurrentStake(operatorId, quorum).call();
            quorumStakes[quorum] = stake;
        }
        return quorumStakes;
    }

    getCheckSignaturesIndices(
        referenceBlockNumber: number,
        quorumNumbers: number[],
        nonSignerOperatorIds: number[]
    ): OperatorStateRetrieverCheckSignaturesIndices {
        const nonSignerOperatorIdsBytes = nonSignerOperatorIds.map(operatorId => 
            Buffer.from(operatorId.toString(16).padStart(64, '0'), 'hex')
        );
        const checkSignatureIndices = this.operatorStateRetriever.methods.getCheckSignaturesIndices(
            this.registryCoordinatorAddr,
            referenceBlockNumber,
            utils.numsToBytes(quorumNumbers),
            nonSignerOperatorIdsBytes
        ).call();

        return {
            nonSignerQuorumBitmapIndices: checkSignatureIndices[0],
            quorumApkIndices: checkSignatureIndices[1],
            totalStakeIndices: checkSignatureIndices[2],
            nonSignerStakeIndices: checkSignatureIndices[3],
        };
    }

    getOperatorId(operatorAddress: Address): Buffer {
        return this.registryCoordinator.methods.getOperatorId(operatorAddress).call();
    }

    getOperatorFromId(operatorId: Buffer): Address {
        return this.registryCoordinator.methods.getOperatorFromId(operatorId).call();
    }

    isOperatorRegistered(operatorAddress: Address): boolean {
        const operatorStatus = this.registryCoordinator.methods.getOperatorStatus(operatorAddress).call();
        return operatorStatus === 1;
    }

    async queryExistingRegisteredOperatorPubkeys(
        startBlock: number = 0,
        stopBlock?: number,
        blockRange: number = DEFAULT_QUERY_BLOCK_RANGE
    ): Promise<[Address[], OperatorPubkeys[], number]> {
        if (stopBlock === undefined) {
            stopBlock = this.ethHttpClient.eth.blockNumber;
        }

        const operatorPubkeys: OperatorPubkeys[] = [];
        const operatorAddresses: Address[] = [];
        let toBlock: number = startBlock;

        for (let i = startBlock; i <= stopBlock; i += blockRange) {
            toBlock = Math.min(i + blockRange - 1, stopBlock);
            const pubkeyUpdates = await this.blsApkRegistry.events.NewPubkeyRegistration.createFilter({
                fromBlock: i,
                toBlock: toBlock
            }).getAllEntries();

            this.logger.debug(
                "avsRegistryChainReader.query_existing_registered_operator_pubkeys",
                {
                    numTransactionLogs: pubkeyUpdates.length,
                    fromBlock: i,
                    toBlock: toBlock,
                }
            );

            for (const update of pubkeyUpdates) {
                const operatorAddr = update.args.operator;
                const pubkeyG1 = update.args.pubkeyG1;
                const pubkeyG2 = update.args.pubkeyG2;
                operatorPubkeys.push({
                    g1PubKey: { X: pubkeyG1.X, Y: pubkeyG1.Y },
                    g2PubKey: { X: pubkeyG2.X, Y: pubkeyG2.Y },
                });
                operatorAddresses.push(operatorAddr);
            }
        }

        return [operatorAddresses, operatorPubkeys, toBlock];
    }

    async queryExistingRegisteredOperatorSockets(
        startBlock: number = 0,
        stopBlock?: number,
        blockRange: number = DEFAULT_QUERY_BLOCK_RANGE
    ): Promise<[Record<string, string>, number]> {
        if (stopBlock === undefined) {
            stopBlock = this.ethHttpClient.eth.blockNumber;
        }

        const operatorIdToSocketMap: Record<string, string> = {};
        let toBlock: number = startBlock;

        for (let i = startBlock; i <= stopBlock; i += blockRange) {
            toBlock = Math.min(i + blockRange - 1, stopBlock);
            const socketUpdates = await this.registryCoordinator.events.OperatorSocketUpdate.createFilter({
                fromBlock: i,
                toBlock: toBlock
            }).getAllEntries();

            let numSocketUpdates = 0;
            for (const update of socketUpdates) {
                operatorIdToSocketMap[update.args.operatorId] = update.args.socket;
                numSocketUpdates += 1;
            }

            this.logger.debug(
                "avsRegistryChainReader.query_existing_registered_operator_sockets",
                {
                    numTransactionLogs: numSocketUpdates,
                    fromBlock: i,
                    toBlock: toBlock,
                }
            );
        }

        return [operatorIdToSocketMap, toBlock];
    }
}
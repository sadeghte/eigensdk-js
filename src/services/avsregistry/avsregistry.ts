import { G1Point, G2Point, Signature } from "../../crypto/bls/attestation.js"
import { BlockNumber, MapOf, QuorumNum, Uint32, Uint8 } from '../../types/general.js'


export type OperatorPubkeys = {
    // G1 signatures are used to verify signatures onchain (since G1 is cheaper to verify onchain via precompiles)
    g1PubKey: G1Point,
	// G2 is used to verify signatures offchain (signatures are on G1)
    g2PubKey: G2Point,

}

export type OperatorInfo = {
    socket: string,
    pubKeys: OperatorPubkeys,
}

export type OperatorAvsState = {
    operatorId: BigInt,
    operatorInfo: OperatorInfo,
    // Stake of the operator for each quorum
    stakePerQuorum: BigInt[][],
    blockNumber: Uint32,
}

export type QuorumAvsState = {
    quorumNumber: Uint8,
    totalStake: BigInt,
    aggPubKeyG1: G1Point,
    blockNumber: Uint32,
}

export type CallOpts = {
    // Whether to operate on the pending state or the last known one
    pending?: boolean,
    // Optional the sender address, otherwise the first account is used
    fromAddress?: string,
    // Optional the block number on which the call should be performed
    blockNumber?: Uint32,
    // Optional the block hash on which the call should be performed
    blockHash?: string,
}

export type OperatorStateRetrieverCheckSignaturesIndices = {
    nonSignerQuorumBitmapIndices: Uint32[],
    quorumApkIndices: Uint32[],
    totalStakeIndices: Uint32[],
    nonSignerStakeIndices: Uint32[][],
}

export type SignedTaskResponseDigest = {
    taskResponse: any,
    blsSignature: Signature,
    operatorId: BigInt,
}

export interface IAvsRegistryService {
    /**
    all the moethods support cancellation through what is called a Context in Go.
    The GetCheckSignaturesIndices should support Context inside CallOpts data class
    **/

    getOperatorsAvsStateAtBlock (
		quorumNumbers: QuorumNum[], 
		blockNumber: BlockNumber
	): Promise<MapOf<BigInt, OperatorAvsState>>;

    getQuorumsAvsStateAtBlock (
        quorumNumbers: QuorumNum[], 
		blockNumber: BlockNumber
    ): Promise<MapOf<QuorumNum, QuorumAvsState>>;

    getCheckSignaturesIndices (
        opts: CallOpts,
        referenceBlockNumber: BlockNumber,
        quorumNumbers: QuorumNum[],
        nonSignerOperatorIds: BigInt[]
    ): Promise<OperatorStateRetrieverCheckSignaturesIndices>;
}
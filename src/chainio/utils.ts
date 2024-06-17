import { Contract, ContractMethod, TransactionReceipt, Web3, eth } from 'web3';
import { LocalAccount } from '../types/general.js';
// import { geth_poa_middleware } from 'web3-middleware-geth-poa'; // Assuming you installed the library

export function numsToBytes(nums: number[]): Uint8Array {
  return new Uint8Array(nums.map(x => String.fromCharCode(x))); // Convert numbers to characters and create Uint8Array
}

export function bitmapToQuorumIds(bitmap: number): number[] {
  const quorumIds: number[] = [];
  for (let i = 0; i < 256; i++) {
    if (bitmap & (1 << i)) {
      quorumIds.push(i);
    }
  }
  return quorumIds;
}

export async function sendTransaction(
	// @ts-ignore
	func: ContractMethod,
	pkWallet: LocalAccount, // Interface for LocalAccount
	ethHttpClient: Web3
): Promise<TransactionReceipt> {
	try {
		const gasPrice = await ethHttpClient.eth.getGasPrice();
		const gasLimit = await func.estimateGas({ from: pkWallet.address });
	
		const tx = await func.send({
		  from: pkWallet.address,
		  gasPrice,
		  gasLimit,
		  privateKey: pkWallet.privateKey, // Assuming private key access is managed securely
		});
	
		console.info(`Transaction sent: ${tx.transactionHash}`);
		return tx;
	  } catch (error) {
		console.error('Error sending transaction:', error);
		return null;
	  }
}

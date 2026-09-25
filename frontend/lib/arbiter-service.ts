import { type Address, type PublicClient } from 'viem';
import { escrowAbi } from './escrow-abi.ts';
import { arbiterChainTarget } from './arbiter-chain.ts';
import type { ArbiterEvidence, OnchainConfig } from './onchain-types.ts';
export async function readArbiterAuthority(client: PublicClient, config: OnchainConfig, evidence: ArbiterEvidence, actor: Address) {
  if (!evidence.onchain) throw Error('No linked chain dispute.');
  const chain = evidence.onchain, target = arbiterChainTarget(chain), address = config.escrow_address as Address;
  const proof = chain.events.find(e => e.name === 'DisputeOpened')!;
  const [receipt, head] = await Promise.all([client.getTransactionReceipt({ hash: proof.transaction_hash as `0x${string}` }), client.getBlockNumber()]);
  if (receipt.status !== 'success' || receipt.blockHash.toLowerCase() !== proof.block_hash.toLowerCase() || receipt.blockNumber !== BigInt(proof.block_number) || head - receipt.blockNumber + BigInt(1) < BigInt(config.confirmations)) throw Error('Unconfirmed dispute receipt.');
  const canonical = await client.getBlock({ blockNumber: receipt.blockNumber });
  if (canonical.hash !== receipt.blockHash || !receipt.logs.some(log => log.address.toLowerCase() === address.toLowerCase() && BigInt(log.logIndex) === BigInt(proof.log_index) && log.data.toLowerCase() === proof.data.toLowerCase() && JSON.stringify(log.topics.map(v => v.toLowerCase())) === JSON.stringify(proof.topics.map(v => v.toLowerCase())))) throw Error('Dispute log not canonical or not from configured escrow.');
  const block = await client.getBlock();
  const [task, manifest, allocation] = await Promise.all([
    client.readContract({ address, abi: escrowAbi, functionName: 'getTask', args: [target.taskId], blockNumber: block.number }),
    client.readContract({ address, abi: escrowAbi, functionName: 'getTaskManifest', args: [target.taskId], blockNumber: block.number }),
    client.readContract({ address, abi: escrowAbi, functionName: 'getDeliverable', args: [target.taskId, BigInt(target.index)], blockNumber: block.number }),
  ]);
  if (task[5] !== BigInt(config.chain_id) || manifest[1].toLowerCase() !== '0x' + evidence.manifest_hash || allocation[0] !== BigInt(evidence.deliverable.amount_base_units) || allocation[1] !== evidence.deliverable.revision_limit || allocation[2] !== BigInt(evidence.deliverable.review_period_hours * 3600) || allocation[3] !== 2 || allocation[6] !== BigInt(chain.allocations[0].dispute_opened_at)) throw Error('Disputed allocation differs from evidence.');
  const primary = actor.toLowerCase() === task[2].toLowerCase(), backup = actor.toLowerCase() === task[3].toLowerCase();
  if (!primary && !backup) throw Error('Wallet not nominated by contract.');
  const handed = allocation[7] !== BigInt(0), window = BigInt(172800);
  return { ...target, buyer: task[0], worker: task[1], amount: allocation[0], blockNumber: block.number, canResolve: handed ? backup && block.timestamp <= allocation[7] + window : primary && block.timestamp <= allocation[6] + window, canHandover: !handed && block.timestamp > allocation[6] + window, role: primary ? 'primary' : 'backup' };
}

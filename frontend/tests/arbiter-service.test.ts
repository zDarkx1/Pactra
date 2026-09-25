import test from 'node:test';
import assert from 'node:assert/strict';
import { encodeAbiParameters, encodeEventTopics, type PublicClient } from 'viem';
import { escrowAbi } from '../lib/escrow-abi.ts';
import { readArbiterAuthority } from '../lib/arbiter-service.ts';
import type { ArbiterEvidence } from '../lib/onchain-types.ts';
const b=BigInt, buyer='0x1111111111111111111111111111111111111111', worker='0x2222222222222222222222222222222222222222', primary='0x3333333333333333333333333333333333333333', backup='0x4444444444444444444444444444444444444444', escrow='0x5555555555555555555555555555555555555555';
const blockHash=('0x'+'b'.repeat(64)) as `0x${string}`, txHash='0x'+'c'.repeat(64), content='a'.repeat(64);
const topics=encodeEventTopics({abi:escrowAbi,eventName:'DisputeOpened',args:{taskId:b(7),index:b(0),opener:buyer}}), data=encodeAbiParameters([{type:'uint64'}],[b(1000)]);
const evidence={manifest_hash:content,deliverable:{amount_base_units:'100',revision_limit:2,review_period_hours:24},onchain:{allocations:[{index:0,state:'disputed',dispute_opened_at:'1000'}],events:[{name:'DisputeOpened',index:0,topics,data,transaction_hash:txHash,block_hash:blockHash,block_number:'10',log_index:'0'}]}} as unknown as ArbiterEvidence;
const config={enabled:true,chain_id:'31337',escrow_address:escrow,confirmations:2,attestation_available:false};
function client(now=1001,handover=0,badLog=false,status=2):PublicClient{return {getTransactionReceipt:async()=>({status:'success',blockHash,blockNumber:b(10),logs:[{address:badLog?buyer:escrow,logIndex:0,data,topics}]}),getBlockNumber:async()=>b(11),getBlock:async()=>({number:b(11),hash:blockHash,timestamp:b(now)}),readContract:async(p:any)=>p.functionName==='getTask'?[buyer,worker,primary,backup,'0x'+'d'.repeat(64),b(31337),2,b(1),b(0)]:p.functionName==='getTaskManifest'?[b(1),'0x'+content]:[b(100),2,b(86400),status,0,b(900),b(1000),b(handover),b(0),b(0)]} as unknown as PublicClient}
test('arbiter role and exact inclusive windows come from canonical receipt and contract, never selected role',async()=>{
  const p=await readArbiterAuthority(client(),config,evidence,primary);assert.equal(p.canResolve,true);assert.equal(p.canHandover,false);
  assert.equal((await readArbiterAuthority(client(),config,evidence,backup)).canResolve,false);
  const elapsed=await readArbiterAuthority(client(173801),config,evidence,primary);assert.equal(elapsed.canResolve,false);assert.equal(elapsed.canHandover,true);
  assert.equal((await readArbiterAuthority(client(173802,173801),config,evidence,backup)).canResolve,true);
  assert.equal((await readArbiterAuthority(client(173802,173801),config,evidence,primary)).canResolve,false);
  await assert.rejects(readArbiterAuthority(client(),config,evidence,buyer));
});
test('foreign log, settled allocation or mismatched terms cannot grant authority',async()=>{
  await assert.rejects(readArbiterAuthority(client(1001,0,true),config,evidence,primary));
  await assert.rejects(readArbiterAuthority(client(1001,0,false,3),config,evidence,primary));
  await assert.rejects(readArbiterAuthority(client(),config,{...evidence,manifest_hash:'f'.repeat(64)},primary));
});

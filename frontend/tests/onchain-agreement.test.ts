import test from 'node:test';
import assert from 'node:assert/strict';
import { decodeFunctionData, hashTypedData, type Hex } from 'viem';
import { agreementTypedData, createAgreement, parseAgreement, serializeAgreement, validateAgreement, verifyAgreementSigner, expiryUTC } from '../lib/onchain-agreement.ts';
import { assertTaskReadback, prepareTaskCall, readVerifiedTask } from '../lib/onchain-service.ts';
import { escrowAbi } from '../lib/onchain-contract.ts';
import { setWorkspaceIdentity } from '../lib/workspace-client.ts';
import { binding, buyerAccount, config, domain, manifestDigest, outsiderAccount, rpcFixture, solidityDigest, task, workerAccount } from './onchain-agreement-fixture.ts';
async function fixture() {
  const original = globalThis.fetch;
  setWorkspaceIdentity({ address: buyerAccount.address, chainId: 31337 });
  const requests: string[] = [];
  globalThis.fetch = async (url, init) => { requests.push(String(url)); assert.equal(init?.body, undefined); return Response.json(binding); };
  const f = rpcFixture();
  const p = await createAgreement(f.client, config, task, 0, '60', '500000');
  const signed = { ...p, buyerSignature: await buyerAccount.signTypedData(agreementTypedData(p)), workerSignature: await workerAccount.signTypedData(agreementTypedData(p)) };
  return { ...f, p, signed, requests, restore() { globalThis.fetch = original; setWorkspaceIdentity(null); } };
}
test('actual local viem EIP-712 signatures match independent Solidity ABI digest; both recover, round-trip and relay exact calldata', async () => {
  const f = await fixture();
  try {
    assert.equal(hashTypedData(agreementTypedData(f.p)), solidityDigest(BigInt(7), BigInt(0), BigInt(60), BigInt(0), BigInt(500000)));
    assert.deepEqual(parseAgreement(serializeAgreement(f.signed)), f.signed);
    await validateAgreement(f.client, config, task, 0, f.signed, true);
    // Permissionless relayer is neither party. Signatures, not backend roles, authorize.
    const intent = { action: 'settleByAgreement' as const, index: 0, agreement: f.signed };
    const call = await prepareTaskCall(f.client, config, task, outsiderAccount.address, intent);
    assert.deepEqual(decodeFunctionData({ abi: escrowAbi, data: call.data }), { functionName: 'settleByAgreement', args: [BigInt(7), BigInt(0), BigInt(60), BigInt(500000), f.signed.buyerSignature, f.signed.workerSignature] });
    assert.equal(call.value, BigInt(0)); assert.equal(f.calls.length, 1);
    assert.equal(call.account, outsiderAccount.address);
    assert.ok(f.reads.some(p => p.method === 'getBlockNumber' && p.cacheTime === 0));
    assert.ok(f.requests.every(p => p.endsWith('/onchain')));
    assert.throws(() => assertTaskReadback(({} as any), intent));
    f.state.status = 3;
    const next = (await readVerifiedTask(f.client, config, task))!;
    assert.doesNotThrow(() => assertTaskReadback(next, intent));
    assert.throws(() => assertTaskReadback(next, { ...intent, agreement: { ...f.signed, message: { ...f.signed.message, workerAmount: '61' } } }));
  } finally { f.restore(); }
});
test('wrong domain/chain/contract/task/index/manifest/award/nonce/expiry and wrong or swapped signers fail closed', async () => {
  const f = await fixture();
  try {
    const mutations = [
      { ...f.signed, domain: { ...f.p.domain, chainId: '1' } },
      { ...f.signed, domain: { ...f.p.domain, verifyingContract: buyerAccount.address } },
      ...Object.entries({ taskId: '8', index: '1', manifestHash: '0x' + 'a'.repeat(64), workerAmount: '61', nonce: '1', expiry: '500001' }).map(([k, v]) => ({ ...f.signed, message: { ...f.p.message, [k]: v } })),
      { ...f.signed, buyerSignature: f.signed.workerSignature },
      { ...f.signed, workerSignature: await outsiderAccount.signTypedData(agreementTypedData(f.p)) },
    ];
    for (const p of mutations) await assert.rejects(validateAgreement(f.client, config, task, 0, p, true));
    for (const missing of [{ buyerSignature: null }, { workerSignature: null }]) {
      await assert.rejects(prepareTaskCall(f.client, config, task, buyerAccount.address, { action: 'settleByAgreement', index: 0, agreement: { ...f.signed, ...missing } }), /Both/);
    }
    assert.equal(f.calls.length, 0);
  } finally { f.restore(); }
});
test('fresh chain state rejects consumed nonce, expiry, settled/unfunded state, absent handover and exact backup deadline', async () => {
  const f = await fixture();
  try {
    for (const patch of [{ nonce: BigInt(1) }, { timestamp: BigInt(500001) }, { status: 3 }, { taskStatus: 1 }, { handover: BigInt(0) }, { timestamp: f.state.handover + BigInt(172800) }, { domain: manifestDigest }, { digestMismatch: true }, { rpcChain: 1 }]) {
      const previous = { ...f.state }; Object.assign(f.state, patch);
      await assert.rejects(validateAgreement(f.client, config, task, 0, f.signed, true));
      Object.assign(f.state, previous);
    }
    f.state.timestamp = BigInt(500000); // inclusive expiry, not wall-clock time
    await validateAgreement(f.client, config, task, 0, f.signed, true);
    f.state.reorg = true;
    await assert.rejects(validateAgreement(f.client, config, task, 0, f.signed, true), /reorganized/);
  } finally { f.restore(); }
});
test('strict input parsing and integer bounds never round amounts or normalize malformed tokens', async () => {
  const f = await fixture();
  try {
    for (const amount of ['01', '-1', '1.5', ' 60', '60\n', '101', String(BigInt(2) ** BigInt(128))]) await assert.rejects(createAgreement(f.client, config, task, 0, amount, '500000'));
    for (const expiry of ['1.5', '-1', '0500000', '500000\n', '500000\u2028', String(BigInt(2) ** BigInt(64))]) await assert.rejects(createAgreement(f.client, config, task, 0, '60', expiry));
    for (const patch of [{ privateKey: 'do-not-paste-keys' }, { types: {} }, { buyerRefund: '40' }]) assert.throws(() => parseAgreement(JSON.stringify({ ...f.p, ...patch })));
    assert.throws(() => parseAgreement(JSON.stringify({ ...f.p, domain: { ...f.p.domain, version: '1' } })));
    assert.throws(() => parseAgreement(JSON.stringify({ ...f.p, buyerSignature: '0x1' })));
    assert.throws(() => parseAgreement(JSON.stringify({ ...f.p, buyerSignature: f.signed.buyerSignature + '\n' })));
    assert.throws(() => parseAgreement(JSON.stringify({ ...f.p, domain: { ...f.p.domain, verifyingContract: config.escrow_address + '\n' } })));
    assert.throws(() => parseAgreement(JSON.stringify({ ...f.p, message: { ...f.p.message, manifestHash: manifestDigest + '\n' } })));
    assert.equal(expiryUTC('500000'), '1970-01-06T18:53:20.000Z');
    for (const amount of ['0', '100']) assert.equal((await createAgreement(f.client, config, task, 0, amount, '500000')).message.workerAmount, amount);
  } finally { f.restore(); }
});
test('EOA compact/noncanonical/high-s signatures are rejected like the final escrow', async () => {
  const f = await fixture();
  try {
    for (const sig of [f.signed.buyerSignature.slice(0, -2), f.signed.buyerSignature.slice(0, -2) + '00', f.signed.buyerSignature.slice(0, 66) + 'f'.repeat(64) + '1b']) {
      await assert.rejects(verifyAgreementSigner(f.client, f.p, buyerAccount.address, sig as Hex, BigInt(13)), /canonical/);
    }
  } finally { f.restore(); }
});
test('ERC-1271 uses chain code and exact padded magic with escrow caller; missing/wrong/reverting responses block', async () => {
  const f = await fixture();
  try {
    f.state.contractSigner = true;
    await validateAgreement(f.client, config, task, 0, { ...f.p, buyerSignature: '0x1234', workerSignature: '0xabcd' }, true);
    assert.equal(f.calls.length, 2);
    assert.ok(f.calls.every(p => p.account === config.escrow_address && p.blockNumber === BigInt(13)));
    for (const magic of ['0x', '0x1626ba7e', '0xffffffff' + '0'.repeat(56), '0x1626ba7e' + '0'.repeat(55) + '1']) {
      f.state.magic = magic as Hex;
      await assert.rejects(validateAgreement(f.client, config, task, 0, { ...f.p, buyerSignature: '0x1234' }), /ERC-1271/);
    }
    f.state.revert = true;
    await assert.rejects(validateAgreement(f.client, config, task, 0, { ...f.p, buyerSignature: '0x1234' }));
  } finally { f.restore(); }
});
test('eth_call revert never produces a relay call result even with valid signatures', async () => {
  const f = await fixture();
  try {
    f.state.revert = true;
    await assert.rejects(prepareTaskCall(f.client, config, task, buyerAccount.address, { action: 'settleByAgreement', index: 0, agreement: f.signed }), /revert/);
    assert.equal(f.state.domain, domain);
  } finally { f.restore(); }
});

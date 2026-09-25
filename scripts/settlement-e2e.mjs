#!/usr/bin/env node
// LOCAL ONLY. Owns no application files, never reads .env or existing wallet keys.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';
import { mkdir, lstat, readFile, writeFile, readdir, cp, symlink, open } from 'node:fs/promises';
import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import net from 'node:net';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PRIVATE = '/root/ui-research/pactra-settlement-e2e';
const RESULT = '/root/pactra-settlement-e2e-result.md';
const DB = 'pactra_settlement_e2e';
const MARKER = 'Pactra settlement E2E disposable local database v1';
const RPC = 'http://127.0.0.1:9545', GO = 'http://127.0.0.1:8799', APP = 'http://localhost:4399';
const CHAIN = 31337;
const args = process.argv.slice(2);
assert(args.every(a => ['--reset-db', '--backend-only'].includes(a)), 'Only --reset-db and --backend-only are supported');
const bff = !args.includes('--backend-only');
const runID = new Date().toISOString().replace(/[:.]/g, '-') + '-' + randomUUID().slice(0, 8);
const DIR = join(PRIVATE, runID);
process.umask(0o077);
const env = { PATH: process.env.PATH, HOME: '/root', LANG: 'C.UTF-8', TMPDIR: DIR,
  PGCONNECT_TIMEOUT: '5', PGPASSFILE: '/dev/null', NEXT_TELEMETRY_DISABLED: '1' };
const children = [];
const report = { runID, status: 'running', scope: bff ? 'Anvil + Go + PostgreSQL + Next BFF HTTP' : 'Anvil + Go + PostgreSQL HTTP (BFF explicitly disabled)',
  uiClicked: false, database: DB + ':5546', origins: { RPC, GO, APP }, checks: [], transactions: [], http: [], sourceHashes: {}, missing: ['UI clicks, browser rendering and wallet-extension QA', 'Production deployment, real funds/keys, retention guarantees', 'Timeout exit and ERC-1271 wallet integration'] };
let phase = 'prerequisites';
const json = x => JSON.stringify(x, (_, v) => typeof v === 'bigint' ? v.toString() : v, 2);
const sha = x => createHash('sha256').update(x).digest('hex');
function check(ok, message) { assert(ok, message); }
function pass(name, evidence = {}) { report.checks.push({ name, ...evidence }); console.log('PASS ' + name); }
async function save(name, content) { await writeFile(join(DIR, name), content, { mode: 0o600 }); }
async function command(file, argv, options = {}) {
  return promisify(execFile)(file, argv, { env, timeout: 120000, maxBuffer: 8 * 1024 * 1024, ...options });
}
async function sql(query, database = DB) {
  // No inherited PGHOST/PGSERVICE/PGDATABASE; only the designated local cluster.
  return (await command('psql', ['-X', '-w', '-h', '/var/run/postgresql', '-p', '5546', '-U', 'root', '-d', database,
    '-At', '-v', 'ON_ERROR_STOP=1', '-c', query])).stdout.trim();
}
async function sqlPrivate(query) {
  // Password only on stdin, not process argv or logs.
  const p = spawn('psql', ['-X', '-w', '-h', '/var/run/postgresql', '-p', '5546', '-U', 'root', '-d', DB,
    '-v', 'ON_ERROR_STOP=1'], { env, stdio: ['pipe', 'ignore', 'pipe'] });
  const deadline = setTimeout(() => p.kill('SIGKILL'), 15000);
  p.stdin.end(query);
  try { await new Promise((yes, no) => { p.on('error', no); p.on('exit', code => code === 0 ? yes() : no(new Error('private DB role provisioning failed'))); }); }
  finally { clearTimeout(deadline); }
}
async function privateDir(path) {
  await mkdir(path, { recursive: true, mode: 0o700 });
  const st = await lstat(path);
  check(st.isDirectory() && !st.isSymbolicLink() && st.uid === process.getuid() && (st.mode & 0o777) === 0o700, 'Unsafe private directory: ' + path);
}
async function freePort(port) {
  const s = net.createServer();
  await new Promise((yes, no) => { s.once('error', no); s.listen(port, '127.0.0.1', yes); });
  await new Promise(yes => s.close(yes));
}
async function start(name, file, argv, options = {}) {
  const log = await open(join(DIR, name + '.log'), 'wx', 0o600);
  const p = spawn(file, argv, { env, detached: true, stdio: ['ignore', log.fd, log.fd], ...options });
  children.push(p);
  p.on('error', e => { p.startError = e; });
  await log.close();
  return p;
}
async function waitReady(p, probe, name, ms = 90000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (p.startError || p.exitCode !== null) throw new Error(name + ' exited; inspect private ' + name + '.log');
    try { if (await probe()) return; } catch { /* bounded readiness polling of real service */ }
    await new Promise(r => setTimeout(r, 250));
  }
  throw new Error(name + ' readiness timed out');
}
async function stop(p) {
  if (!p || p.exitCode !== null) return;
  try { process.kill(-p.pid, 'SIGTERM'); } catch { return; }
  await Promise.race([new Promise(r => p.once('exit', r)), new Promise(r => setTimeout(r, 3000))]);
  // Also stop any child left in our own process group.
  try { process.kill(-p.pid, 'SIGKILL'); } catch { /* exited */ }
}
async function treeHashes(path, prefix = '') {
  const result = {};
  for (const entry of (await readdir(path, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
    if (['node_modules', '.next', '.git', 'out', 'cache', '.toolchain', 'verification'].includes(entry.name) || entry.name.startsWith('.env')) continue;
    const key = prefix + entry.name, full = join(path, entry.name);
    if (entry.isDirectory()) Object.assign(result, await treeHashes(full, key + '/'));
    else if (entry.isFile()) result[key] = sha(await readFile(full));
  }
  return result;
}
async function snapshot(name) {
  const src = join(ROOT, name), dest = join(DIR, name);
  const before = await treeHashes(src);
  await cp(src, dest, { recursive: true, filter: path => !path.split('/').some(s => ['node_modules', '.next', '.git', 'out', 'cache', '.toolchain', 'verification'].includes(s) || s.startsWith('.env')) });
  assert.deepEqual(await treeHashes(src), before, name + ' changed during snapshot; coordinate workers and rerun');
  assert.deepEqual(await treeHashes(dest), before, name + ' snapshot mismatch');
  report.sourceHashes[name] = before;
  return dest;
}
async function tool(name) {
  for (const base of [join(ROOT, 'contracts/.toolchain'), '/root/.foundry/bin', '/root/.local/bin', '/root/.local/share/pactra-foundry-v1.8.3']) {
    const path = join(base, name);
    try { const v = await command(path, ['--version']); report[name + 'Version'] = v.stdout.trim(); return path; } catch { /* only known local tool paths */ }
  }
  throw new Error('Missing ' + name + '; install Foundry locally; harness will not download executables');
}
let rpcID = 0;
async function rpc(method, params = []) {
  const r = await fetch(RPC, { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: ++rpcID, method, params }), signal: AbortSignal.timeout(10000) });
  check(r.ok, 'RPC HTTP failure');
  const data = await r.json();
  if (data.error) throw new Error('Local RPC ' + method + ': ' + data.error.message);
  return data.result;
}

async function run() {
  await privateDir(PRIVATE); await privateDir(DIR);
  const lock = await open(join(PRIVATE, 'run.lock'), 'wx', 0o600).catch(() => { throw new Error('Another run or stale run.lock exists; inspect local processes before removing it'); });
  await lock.writeFile(String(process.pid)); await lock.close();
  report.lockOwned = true;
  for (const port of [9545, 8799, ...(bff ? [4399] : [])]) await freePort(port);
  const require = createRequire(join(ROOT, 'package.json'));
  const { createPublicClient, createWalletClient, http, defineChain, encodeFunctionData, encodeDeployData, hashTypedData } = require('viem');
  const { generatePrivateKey, privateKeyToAccount } = require('viem/accounts');
  const { parseSiweMessage } = require('viem/siwe');
  const accounts = {}, fixtures = {};
  for (const role of ['buyer', 'worker', 'primary', 'backup', 'outsider', 'attestor']) {
    const privateKey = generatePrivateKey();
    accounts[role] = privateKeyToAccount(privateKey);
    fixtures[role] = { address: accounts[role].address, privateKey };
  }
  await save('fixtures.json', json({ purpose: 'LOCAL GENERATED TEST KEYS ONLY', fixtures }));
  await save('attestor.key', fixtures.attestor.privateKey.slice(2) + '\n');
  const [anvil, forge] = await Promise.all([tool('anvil'), tool('forge')]);
  phase = 'isolated-builds';
  const backend = await snapshot('backend');
  const contracts = await snapshot('contracts');
  // Forge source-only build, isolated out/cache; never reuse a worker's stale artifact.
  const build = await command(forge, ['build', '--offline', '--skip', 'test', '--skip', 'script'], { cwd: contracts });
  await save('forge-build.log', build.stdout + build.stderr);
  const goBuild = await command('go', ['build', '-o', join(DIR, 'pactra-api'), './cmd/server'], { cwd: backend, timeout: 180000 });
  await save('go-build.log', goBuild.stdout + goBuild.stderr);
  report.binarySHA256 = sha(await readFile(join(DIR, 'pactra-api')));
  const artifact = JSON.parse(await readFile(join(contracts, 'out/PactraEscrow.sol/PactraEscrow.json'), 'utf8'));
  const abi = artifact.abi;
  for (const method of ['acceptDeliverable', 'requestRevision', 'openDispute']) {
    const entries = abi.filter(x => x.type === 'function' && x.name === method);
    check(entries.length === 1 && entries[0].inputs.length === 5, 'APP-03 frozen review evidence ABI missing: ' + method);
  }
  report.contractBytecodeSHA256 = sha(artifact.bytecode.object);
  pass('fresh isolated Go and contract builds, guarded review ABI');

  phase = 'isolated-db';
  const exists = await sql(`SELECT shobj_description(oid,'pg_database') FROM pg_database WHERE datname='${DB}'`, 'postgres');
  const present = await sql(`SELECT count(*) FROM pg_database WHERE datname='${DB}'`, 'postgres');
  if (present === '1') {
    check(args.includes('--reset-db') && exists === MARKER, 'DB exists; only --reset-db with exact harness ownership marker may drop it');
    check(await sql(`SELECT count(*) FROM pg_stat_activity WHERE datname='${DB}'`, 'postgres') === '0', 'Isolated DB has active clients; refusing reset');
    await sql(`DROP DATABASE ${DB}`, 'postgres');
  }
  await sql(`CREATE DATABASE ${DB}`, 'postgres');
  await sql(`COMMENT ON DATABASE ${DB} IS '${MARKER}'`, 'postgres');
  check(await sql('SELECT current_database()') === DB, 'Wrong DB');
  for (const file of (await readdir(join(backend, 'migrations'))).filter(f => /^\d+.*\.sql$/.test(f)).sort()) {
    await command('psql', ['-X', '-w', '-h', '/var/run/postgresql', '-p', '5546', '-U', 'root', '-d', DB,
      '-v', 'ON_ERROR_STOP=1', '-f', join(backend, 'migrations', file)]);
  }
  // Per-run nonsuperuser role, scoped only to this DB's private schema.
  const role = 'pactra_se2e_' + randomBytes(6).toString('hex');
  const password = randomBytes(32).toString('hex');
  report.runtimeRole = role;
  await sqlPrivate(`CREATE ROLE ${role} LOGIN PASSWORD '${password}' NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION;
    REVOKE CONNECT ON DATABASE ${DB} FROM PUBLIC;
    GRANT CONNECT ON DATABASE ${DB} TO ${role}; GRANT USAGE ON SCHEMA pactra TO ${role};
    GRANT SELECT,INSERT ON ALL TABLES IN SCHEMA pactra TO ${role};
    GRANT UPDATE ON pactra.tasks,pactra.challenges,pactra.challenge_limits,pactra.ai_usage_global,pactra.ai_usage_wallet TO ${role};`);
  check(await sql(`SELECT rolsuper OR rolcreatedb OR rolcreaterole FROM pg_roles WHERE rolname='${role}'`) === 'f', 'Unsafe runtime role');
  pass('new isolated PostgreSQL schema and restricted runtime role');

  phase = 'anvil-deployment';
  const anvilProcess = await start('anvil', anvil, ['--host', '127.0.0.1', '--port', '9545', '--chain-id', String(CHAIN), '--silent']);
  await waitReady(anvilProcess, async () => await rpc('eth_chainId') === '0x7a69', 'anvil');
  check((await rpc('web3_clientVersion')).toLowerCase().includes('anvil'), 'Not Anvil');
  // Fund generated identities locally; all subsequent writes are signed raw tx, no impersonation.
  for (const account of Object.values(accounts)) await rpc('anvil_setBalance', [account.address, '0x56bc75e2d63100000']);
  const chain = defineChain({ id: CHAIN, name: 'Pactra isolated E2E', nativeCurrency: { name: 'Test Ether', symbol: 'ETH', decimals: 18 }, rpcUrls: { default: { http: [RPC] } } });
  const client = createPublicClient({ chain, transport: http(RPC, { timeout: 10000, retryCount: 0 }) });
  const wallets = Object.fromEntries(Object.entries(accounts).map(([role, account]) => [role, createWalletClient({ account, chain, transport: http(RPC, { retryCount: 0 }) })]));
  async function rawTx(role, data, to, value = 0n, success = true, label = 'transaction') {
    const hash = await wallets[role].sendTransaction({ to, data, value, gas: 9000000n });
    const receipt = await client.waitForTransactionReceipt({ hash, timeout: 15000 });
    const block = await client.getBlock({ blockNumber: receipt.blockNumber });
    check(block.hash === receipt.blockHash, 'Receipt not canonical');
    report.transactions.push({ label, role, hash, blockNumber: receipt.blockNumber, blockHash: receipt.blockHash, status: receipt.status });
    check(receipt.status === (success ? 'success' : 'reverted'), label + ' unexpected receipt status ' + receipt.status);
    return receipt;
  }
  const deployed = await rawTx('buyer', encodeDeployData({ abi, bytecode: artifact.bytecode.object, args: [accounts.attestor.address] }), undefined, 0n, true, 'deploy');
  const escrow = deployed.contractAddress;
  report.escrow = escrow;
  const read = (functionName, args = []) => client.readContract({ address: escrow, abi, functionName, args });
  const tx = (role, method, args = [], value = 0n, success = true) => rawTx(role, encodeFunctionData({ abi, functionName: method, args }), escrow, value, success, method);
  check((await read('evidenceAttestor')).toLowerCase() === accounts.attestor.address.toLowerCase(), 'Wrong attestor');
  pass('real local deployment with generated identities', { escrow });

  phase = 'go-and-bff-start';
  const runtime = { ...env, HOST: '127.0.0.1', PORT: '8799',
    DATABASE_URL: `postgres://${role}:${password}@127.0.0.1:5546/${DB}?sslmode=disable`,
    PACTRA_AUTH_DOMAIN: 'localhost:4399', PACTRA_AUTH_URI: APP, PACTRA_APP_ORIGIN: APP,
    PACTRA_CHAIN_ID: String(CHAIN), PACTRA_ARBITERS: [accounts.primary.address, accounts.backup.address].join(','),
    PACTRA_ONCHAIN_ENABLED: 'true', PACTRA_ONCHAIN_RPC_URL: RPC, PACTRA_ONCHAIN_ESCROW: escrow,
    PACTRA_ONCHAIN_CONFIRMATIONS: '1', PACTRA_ONCHAIN_ATTESTOR_KEY_FILE: join(DIR, 'attestor.key'),
    PACTRA_PUBLIC_AI_ENABLED: 'false' };
  await save('go-env.json', json(runtime));
  const backendProcess = await start('go', join(DIR, 'pactra-api'), [], { env: runtime });
  await waitReady(backendProcess, async () => (await fetch(GO + '/ready', { signal: AbortSignal.timeout(3000) })).ok, 'go');
  if (bff) {
    const frontend = await snapshot('frontend');
    await symlink(join(ROOT, 'node_modules'), join(DIR, 'node_modules'));
    await cp(join(ROOT, 'package.json'), join(DIR, 'package.json'));
    await cp(join(ROOT, 'package-lock.json'), join(DIR, 'package-lock.json'));
    const webEnv = { ...env, NODE_ENV: 'development', GO_API_URL: GO, PACTRA_APP_ORIGIN: APP,
      PACTRA_CHAIN_ID: String(CHAIN), PACTRA_CHAIN_NAME: 'Pactra LOCAL E2E', PACTRA_RPC_URL: RPC,
      PACTRA_NATIVE_CURRENCY_NAME: 'Test Ether', PACTRA_NATIVE_CURRENCY_SYMBOL: 'ETH', PACTRA_NATIVE_CURRENCY_DECIMALS: '18',
      PACTRA_ARBITERS: runtime.PACTRA_ARBITERS, PACTRA_PUBLIC_AI_ENABLED: 'false' };
    await save('web-env.json', json(webEnv));
    const web = await start('web', process.execPath, [require.resolve('next/dist/bin/next'), 'dev', '--webpack', '--hostname', '127.0.0.1', '--port', '4399'], { env: webEnv, cwd: frontend });
    await waitReady(web, async () => { const r = await fetch(APP + '/api/workspace/me', { signal: AbortSignal.timeout(5000) }); await r.body?.cancel(); return r.status === 401; }, 'web');
  }
  pass(bff ? 'real Go readiness and isolated Next BFF readiness' : 'real Go readiness (BFF not run)');

  const cookies = {}, tokens = {};
  async function api(role, path, method = 'GET', body, expected = 200, extra = {}) {
    const headers = { 'Content-Type': 'application/json', Origin: APP,
      'X-Pactra-Address': accounts[role].address.toLowerCase(), 'X-Pactra-Chain': String(CHAIN), ...extra };
    if (bff) headers.Cookie = Object.entries(cookies[role] || {}).map(([k, v]) => k + '=' + v).join('; ');
    else if (tokens[role]) headers.Authorization = 'Bearer ' + tokens[role];
    const response = await fetch((bff ? APP + '/api/workspace' : GO + '/api/v1') + path, {
      method, headers, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(30000), redirect: 'error' });
    for (const cookie of response.headers.getSetCookie()) {
      const [pair] = cookie.split(';'), i = pair.indexOf('=');
      (cookies[role] ||= {})[pair.slice(0, i)] = pair.slice(i + 1);
      if (pair.startsWith('pactra_session=') && !pair.endsWith('=')) check(cookie.includes('HttpOnly') && cookie.includes('SameSite=Strict'), 'Cookie flags missing');
    }
    const data = response.status === 204 ? null : await response.json();
    report.http.push({ role, path, method, status: response.status, expected });
    check(response.status === expected, `${role} ${method} ${path}: expected ${expected}, got ${response.status}`);
    return data;
  }
  phase = 'real-siwe-auth';
  for (const role of ['buyer', 'worker', 'primary', 'backup', 'outsider']) {
    const c = await api(role, '/auth/challenge', 'POST', { address: accounts[role].address }, 201);
    const siwe = parseSiweMessage(c.message);
    check(siwe.domain === 'localhost:4399' && siwe.uri === APP && siwe.chainId === CHAIN && siwe.address.toLowerCase() === accounts[role].address.toLowerCase(), 'Refusing nonlocal SIWE');
    const session = await api(role, '/auth/verify', 'POST', { challenge_id: c.challenge_id, signature: await accounts[role].signMessage({ message: c.message }) });
    if (!bff) tokens[role] = session.token;
    check((await api(role, '/me')).address === accounts[role].address.toLowerCase(), 'Auth identity mismatch');
  }
  const config = await api('buyer', '/onchain/config');
  check(config.enabled && config.attestation_available && config.escrow_address.toLowerCase() === escrow.toLowerCase(), 'Onchain runtime configuration');
  pass('five generated identities authenticated with genuine SIWE signatures');

  phase = 'existing-agreement-to-binding';
  const names = ['backup-case', 'accepted', 'bilateral', 'never-submitted', 'primary-case'];
  const input = { title: 'LOCAL settlement E2E ' + runID, source: { greeting: 'Hello' }, worker: accounts.worker.address,
    primary_arbiter: accounts.primary.address, backup_arbiter: accounts.backup.address,
    delivery_deadline: new Date(Date.now() + 7 * 86400000).toISOString().replace(/\.\d{3}Z$/, 'Z'),
    deliverables: names.map(id => ({ id, title: id, criteria: 'Exact persisted inline artifact is retrievable; not a quality attestation.', amount_base_units: '1000', revision_limit: 2, review_period_hours: 24 })) };
  const task = await api('buyer', '/tasks', 'POST', input, 201, { 'Idempotency-Key': randomUUID() });
  check(/^[a-f0-9-]{36}$/.test(task.id), 'Task ID');
  report.taskID = task.id;
  const base = '/tasks/' + task.id, delivery = i => base + '/deliverables/' + names[i];
  const accepted = await api('worker', base + '/accept', 'POST', { manifest_hash: task.manifest_hash });
  check(accepted.status === 'accepted_unfunded', 'Local agreement acceptance');
  const canonical = await sql(`SELECT manifest_json FROM pactra.tasks WHERE id='${task.id}'::uuid`);
  check(sha(canonical) === task.manifest_hash, 'Persisted manifest hash mismatch');
  const manifest = JSON.parse(canonical);
  const deadline = BigInt(Date.parse(manifest.delivery_deadline) / 1000);
  const configs = manifest.deliverables.map(d => ({ amount: BigInt(d.amount_base_units), revisionLimit: d.revision_limit, reviewWindow: BigInt(d.review_period_hours * 3600), deliveryDeadline: deadline }));
  const createArgs = [manifest.worker, manifest.primary_arbiter, manifest.backup_arbiter, BigInt(CHAIN), BigInt(manifest.version), '0x' + task.manifest_hash, configs];
  // A real successful receipt from the wrong buyer must not bind this agreement.
  const foreign = await tx('outsider', 'createTask', createArgs);
  await api('buyer', base + '/onchain/reconcile', 'POST', { transaction_hash: foreign.transactionHash }, 503);
  const created = await tx('buyer', 'createTask', createArgs);
  await api('outsider', base + '/onchain/reconcile', 'POST', { transaction_hash: created.transactionHash }, 404);
  await api('buyer', base + '/onchain/reconcile', 'POST', { transaction_hash: created.transactionHash, status: 'funded' }, 400);
  const binding = await api('buyer', base + '/onchain/reconcile', 'POST', { transaction_hash: created.transactionHash });
  const id = BigInt(binding.onchain_task_id);
  report.onchainTaskID = id;
  check(binding.lifecycle.task_state === 'awaiting_worker', 'Creation mistaken for funding');
  check(await sql(`SELECT count(*) FROM pactra.onchain_bindings WHERE task_id='${task.id}'`) === '1', 'Binding not persisted');
  async function observe(index, state, taskState = 'funded', event) {
    const proof = await api('buyer', base + '/onchain');
    check(proof.transaction_hash === created.transactionHash && proof.lifecycle.task_state === taskState, 'Creation/lifecycle identity');
    const allocation = proof.lifecycle.allocations[index];
    check(allocation.state === state, `allocation ${index}: expected ${state}, got ${allocation.state}`);
    if (event && !bff) check(proof.lifecycle.events.some(e => e.name === event), 'Missing verified event ' + event);
    await save('latest-lifecycle.json', json(proof));
    // BFF deliberately projects only eligibility; read financial evidence from the real contract.
    if (bff) {
      const d = await read('getDeliverable', [id, BigInt(index)]);
      const e = await read('getDeliveryEvidence', [id, BigInt(index)]);
      return { ...allocation, artifact_hash: e[2], submitted_at: String(d[5]), worker_award: String(d[8]), buyer_refund: String(d[9]), settlement_nonce: String(await read('settlementNonces', [id, BigInt(index)])) };
    }
    return allocation;
  }
  await tx('worker', 'acceptTask', [id]);
  await observe(0, 'awaiting_submission', 'accepted_unfunded', 'WorkerAccepted');
  const total = BigInt(manifest.total_base_units);
  await tx('buyer', 'fundTask', [id], total);
  await observe(0, 'awaiting_submission', 'funded', 'TaskFunded');
  await api('buyer', base + '/onchain/reconcile', 'POST', { transaction_hash: foreign.transactionHash }, 409);
  await api('outsider', base, 'GET', undefined, 404);
  await api('outsider', base + '/onchain', 'GET', undefined, 404);
  pass('accepted workspace agreement bound to actual creation; accept/fund observed; foreign receipt rejected');

  phase = 'persistence-and-signed-availability';
  const local = new Map();
  async function persist(i, version = 0) {
    const old = local.get(i);
    const artifact = { greeting: `Hello local ${names[i]} round ${version + 1}` };
    const payload = { idempotency_key: randomUUID(), unfunded_review: true, manifest_hash: task.manifest_hash,
      expected_version: version, artifact_hash: old?.latest_artifact_hash || '', notes: '', artifact };
    const post = await api('worker', delivery(i) + '/submissions', 'POST', payload, 201);
    assert.deepEqual(await api('worker', delivery(i) + '/submissions', 'POST', payload, 201), post, 'Idempotent append');
    const fetched = await api('buyer', delivery(i) + '/submissions');
    const entry = fetched.submissions.at(-1);
    check(fetched.latest_version === version + 1 && fetched.latest_artifact_hash === sha(JSON.stringify(artifact)), 'Artifact hash/version');
    assert.deepEqual(entry.artifact, artifact, 'Buyer did not retrieve persisted bytes');
    local.set(i, fetched);
    await save('delivery-' + i + '-v' + (version + 1) + '.json', json(fetched));
    return fetched;
  }
  async function availability(i) {
    const history = local.get(i);
    const payload = { artifact_hash: history.latest_artifact_hash, expected_version: history.latest_version };
    const receipt = await api('worker', delivery(i) + '/onchain/availability', 'POST', payload);
    assert.deepEqual(await api('worker', delivery(i) + '/onchain/availability', 'POST', payload), receipt, 'Receipt retry should reuse persisted signature');
    check(await read('submissionDigest', [id, BigInt(i), BigInt(receipt.round), '0x' + receipt.artifact_hash, BigInt(receipt.expiry)]) === receipt.digest, 'Backend/contract digest mismatch');
    return receipt;
  }
  const availabilityPath = delivery(0) + '/onchain/availability';
  await api('worker', availabilityPath, 'POST', { artifact_hash: '1'.repeat(64), expected_version: 1 }, 409);
  await persist(0);
  const payload = { artifact_hash: local.get(0).latest_artifact_hash, expected_version: 1 };
  await api('buyer', availabilityPath, 'POST', payload, 403);
  await api('outsider', availabilityPath, 'POST', payload, 404);
  await api('outsider', delivery(0) + '/submissions', 'GET', undefined, 404);
  let receipt = await availability(0);
  const unauthorized = await accounts.outsider.sign({ hash: receipt.digest });
  const before = await read('getDeliverable', [id, 0n]);
  await tx('worker', 'submitDeliverable', [id, 0n, '0x' + receipt.artifact_hash, BigInt(receipt.expiry), unauthorized], 0n, false);
  await tx('outsider', 'submitDeliverable', [id, 0n, '0x' + receipt.artifact_hash, BigInt(receipt.expiry), receipt.signature], 0n, false);
  await tx('worker', 'submitDeliverable', [id, 1n, '0x' + receipt.artifact_hash, BigInt(receipt.expiry), receipt.signature], 0n, false);
  assert.deepEqual(await read('getDeliverable', [id, 0n]), before, 'Rejected receipts changed state');
  const submit = (i, r) => tx('worker', 'submitDeliverable', [id, BigInt(i), '0x' + r.artifact_hash, BigInt(r.expiry), r.signature]);
  await submit(0, receipt);
  const first = await observe(0, 'in_review', 'funded', 'EvidenceRecorded');
  const consent = d => [BigInt(d.round), d.artifact_hash, BigInt(d.submitted_at)];
  const frozen = consent(first);
  await tx('buyer', 'requestRevision', [id, 0n, ...frozen]);
  await observe(0, 'awaiting_submission', 'funded', 'RevisionRequested');
  await api('worker', availabilityPath, 'POST', payload, 409);
  await persist(0, 1);
  check(local.get(0).reviews.length === 0, 'Chain-only revision fabricated a local review');
  receipt = await availability(0);
  check(receipt.round === '2', 'Round two receipt');
  await submit(0, receipt);
  const round2 = await observe(0, 'in_review');
  for (const action of ['acceptDeliverable', 'requestRevision', 'openDispute']) await tx('buyer', action, [id, 0n, ...frozen], 0n, false);
  const fresh = consent(round2);
  await tx('buyer', 'openDispute', [id, 0n, ...fresh]);
  await observe(0, 'disputed', 'funded', 'DisputeOpened');
  pass('persisted buyer-readable artifact, signed availability, unauthorized signer/actor/index denied, chain revision and frozen-consent rejection');

  phase = 'arbiter-scoped-evidence';
  const evidencePath = i => `/arbiter/tasks/${task.id}/deliverables/${names[i]}/evidence`;
  for (const role of ['primary', 'backup']) {
    const queue = await api(role, '/arbiter/disputes');
    check(queue.disputes.length === 1 && queue.disputes[0].task_id === task.id && queue.disputes[0].deliverable_id === names[0], 'Arbiter queue scope');
    const evidence = await api(role, evidencePath(0));
    check(evidence.onchain.allocations.length === 1 && evidence.onchain.allocations[0].index === 0 && evidence.delivery.disputes.length === 0, 'Arbiter evidence scope or invented local dispute');
    check(evidence.onchain.events.every(e => e.index === undefined || e.index === 0), 'Sibling event leaked');
    await api(role, evidencePath(1), 'GET', undefined, 404);
    await api(role, base, 'GET', undefined, 404);
    await api(role, delivery(0) + '/submissions', 'GET', undefined, 404);
  }
  await api('outsider', evidencePath(0), 'GET', undefined, 404);
  const outsiderQueue = await api('outsider', '/arbiter/disputes');
  check(outsiderQueue.disputes.length === 0, 'Outsider discovered private cases');
  await tx('outsider', 'resolveDispute', [id, 0n, 1000n], 0n, false);
  pass('primary/backup discover only scoped dispute; sibling/general/outsider evidence denied');

  phase = 'other-funded-exits';
  for (const i of [1, 2, 4]) { await persist(i); await submit(i, await availability(i)); }
  const review1 = await observe(1, 'in_review');
  await tx('buyer', 'acceptDeliverable', [id, 1n, ...consent(review1)]);
  await observe(1, 'settled', 'funded', 'DeliverableAccepted');
  for (const i of [2, 4]) {
    const d = await observe(i, 'in_review');
    await tx('buyer', 'openDispute', [id, BigInt(i), ...consent(d)]);
  }
  await tx('primary', 'resolveDispute', [id, 4n, 700n]);
  await observe(4, 'settled', 'funded', 'DisputeResolved');
  await tx('buyer', 'refundUnsubmitted', [id, 3n], 0n, false);
  await tx('backup', 'resolveDispute', [id, 0n, 400n], 0n, false);
  await rpc('evm_increaseTime', [172801]); await rpc('evm_mine');
  for (const i of [0, 2]) await tx('outsider', 'handoverDispute', [id, BigInt(i)]);
  await tx('primary', 'resolveDispute', [id, 0n, 400n], 0n, false);
  await tx('backup', 'resolveDispute', [id, 0n, 400n]);
  await observe(0, 'settled', 'funded', 'DisputeHandover');
  await api('primary', evidencePath(0), 'GET', undefined, 404);
  pass('buyer acceptance, primary resolution and recorded handover/backup resolution; wrong authority and early refund rejected');

  phase = 'bilateral-after-both-windows';
  const domain = { name: 'PactraEscrow', version: '2', chainId: CHAIN, verifyingContract: escrow };
  const types = { Settlement: [ { name: 'taskId', type: 'uint256' }, { name: 'index', type: 'uint256' }, { name: 'manifestHash', type: 'bytes32' }, { name: 'workerAmount', type: 'uint128' }, { name: 'nonce', type: 'uint256' }, { name: 'expiry', type: 'uint64' } ] };
  const signSettlement = async () => {
    const expiry = (await client.getBlock()).timestamp + 3600n;
    const message = { taskId: id, index: 2n, manifestHash: binding.manifest_digest, workerAmount: 500n, nonce: await read('settlementNonces', [id, 2n]), expiry };
    const typed = { domain, types, primaryType: 'Settlement', message };
    check(hashTypedData(typed) === await read('settlementDigest', [id, 2n, 500n, expiry]), 'Bilateral digest mismatch');
    const buyerSig = await accounts.buyer.signTypedData(typed), workerSig = await accounts.worker.signTypedData(typed);
    return [id, 2n, 500n, expiry, buyerSig, workerSig];
  };
  await tx('outsider', 'settleByAgreement', await signSettlement(), 0n, false);
  await rpc('evm_increaseTime', [172801]); await rpc('evm_mine');
  await tx('backup', 'resolveDispute', [id, 2n, 500n], 0n, false);
  const settlement = await signSettlement();
  await tx('outsider', 'settleByAgreement', [...settlement.slice(0, 5), settlement[4]], 0n, false);
  await tx('outsider', 'settleByAgreement', settlement);
  const bilateral = await observe(2, 'settled', 'funded', 'AgreementSettled');
  check(bilateral.worker_award === '500' && bilateral.buyer_refund === '500' && bilateral.settlement_nonce === '1', 'Bilateral split or nonce mismatch');
  await tx('outsider', 'settleByAgreement', settlement, 0n, false);
  pass('both missed arbiter windows: dual EIP-712 signatures settle; premature, single-party and replay tx rejected');

  phase = 'deadline-refund-and-withdrawals';
  await rpc('evm_setNextBlockTimestamp', [Number(deadline + 1n)]); await rpc('evm_mine');
  await tx('buyer', 'refundUnsubmitted', [id, 3n]);
  await observe(3, 'settled', 'completed', 'UnsubmittedRefunded');
  await tx('buyer', 'refundUnsubmitted', [id, 0n], 0n, false);
  const workerCredit = await read('balances', [accounts.worker.address]);
  const buyerCredit = await read('balances', [accounts.buyer.address]);
  check(workerCredit === 2600n && buyerCredit === 2400n && workerCredit + buyerCredit === total, 'Allocation conservation');
  for (const [role, credit] of [['worker', workerCredit], ['buyer', buyerCredit]]) {
    const beforeBalance = await client.getBalance({ address: accounts[role].address });
    const r = await tx(role, 'withdraw');
    const afterBalance = await client.getBalance({ address: accounts[role].address });
    check(afterBalance === beforeBalance + credit - r.gasUsed * r.effectiveGasPrice, 'Actual withdrawal net balance mismatch');
    check(await read('balances', [accounts[role].address]) === 0n, 'Withdrawal credit not zero');
  }
  check(await client.getBalance({ address: escrow }) === 0n, 'Escrow did not empty');
  await observe(0, 'settled', 'completed', 'TaskCompleted');
  check((await api('buyer', base)).status === 'accepted_unfunded', 'Local status improperly overwritten');
  check((await api('primary', '/arbiter/disputes')).disputes.length === 0, 'Resolved chain-only cases remained');
  const persisted = await sql(`SELECT json_build_object('bindings',(SELECT count(*) FROM pactra.onchain_bindings),'receipts',(SELECT count(*) FROM pactra.availability_attestations),'delivery_events',(SELECT count(*) FROM pactra.delivery_events))`);
  report.persisted = JSON.parse(persisted);
  check(report.persisted.bindings === 1 && report.persisted.receipts === 5, 'Unexpected persisted evidence count');
  pass('deadline-only never-submitted refund, completion and real buyer/worker withdrawals with gas-adjusted balance proof', { workerCredit, buyerCredit, persisted: report.persisted });

  phase = 'fail-closed-and-source-freshness';
  await rpc('anvil_reset');
  await api('buyer', base + '/onchain', 'GET', undefined, 503);
  pass('removed chain history fails closed despite persisted binding');
  for (const name of Object.keys(report.sourceHashes)) assert.deepEqual(await treeHashes(join(ROOT, name)), report.sourceHashes[name], name + ' changed after snapshot: tested snapshot is recorded, rerun for final current-source pass');
  pass('tested source snapshots still match worker files at completion');
  report.status = 'passed';
}

// Bound the entire run, including cleanup; no silent partial-success fallback.
const watchdog = setTimeout(() => {
  for (const p of children) { try { process.kill(-p.pid, 'SIGKILL'); } catch { /* exited */ } }
  report.status = 'failed'; report.error = '15-minute global deadline exceeded'; report.phase = phase;
  Promise.all([save('report.json', json(report)), writeFile(RESULT, 'FAILED: settlement E2E exceeded 15 minutes. No pass claimed. Inspect ' + DIR + '\n', { mode: 0o600 })]).finally(() => process.exit(1));
}, 15 * 60 * 1000);
try { await run(); }
catch (e) { report.status = 'failed'; report.phase = phase; report.error = e.message; console.error('FAIL ' + phase + ': ' + e.message); process.exitCode = 1; }
finally {
  for (const p of children.reverse()) await stop(p);
  if (report.runtimeRole) {
    try {
      await sql(`DROP OWNED BY ${report.runtimeRole}; DROP ROLE ${report.runtimeRole};`);
      check(await sql(`SELECT count(*) FROM pg_roles WHERE rolname='${report.runtimeRole}'`) === '0', 'Runtime role cleanup readback');
      report.runtimeRoleRemoved = true;
    } catch { report.cleanupError = 'Restricted runtime role cleanup failed'; report.status = 'failed'; process.exitCode = 1; }
  }
  if (!bff) report.missing.push('Next BFF explicitly disabled; no BFF claim');
  try {
    await save('report.json', json(report));
    const lines = [report.status.toUpperCase() + ': Pactra settlement integration E2E', '',
      'Run: ' + runID, 'Scope: ' + report.scope, 'UI clicked: NO. All application actions are HTTP API calls; chain actions are signed raw transactions.',
      'Database: ' + report.database + '. No production DB, external RPC, real keys or public deployment.',
      'Private evidence: ' + DIR + '/report.json', 'Reproduce: node scripts/settlement-e2e.mjs --reset-db' + (bff ? '' : ' --backend-only'), '',
      'Verified checks:', ...report.checks.map(c => '- ' + c.name), '',
      'Actual receipt count: ' + report.transactions.length, 'Remaining scope:', ...report.missing.map(x => '- ' + x),
      ...(report.error ? ['', 'Failure phase: ' + report.phase, 'Failure: ' + report.error] : []),
      ...(report.cleanupError ? ['', report.cleanupError] : []), '',
      'All harness-started process groups stopped. Database retained for inspection; generated keys/logs/env stay private. No shared .next build, commits, pushes or deploys.', ''];
    await writeFile(RESULT, lines.join('\n'), { mode: 0o600 });
    console.log('Result: ' + RESULT); console.log('Evidence: ' + DIR);
  } finally {
    if (report.lockOwned) { const { unlink } = await import('node:fs/promises'); await unlink(join(PRIVATE, 'run.lock')); }
    clearTimeout(watchdog);
  }
}

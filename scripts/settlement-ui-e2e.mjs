#!/usr/bin/env node
// LOCAL ONLY: actual Next/Go/Postgres/Anvil, with a generated-key EIP-1193 wallet.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';
import { mkdir, lstat, readFile, writeFile, readdir, cp, symlink, open, unlink } from 'node:fs/promises';
import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import net from 'node:net';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PRIVATE = '/root/ui-research/pactra-settlement-ui';
const RESULT = '/root/pactra-settlement-ui-result.md';
const DB = 'pactra_settlement_ui5546';
const MARKER = 'Pactra actual UI disposable local database v1';
const RPC = 'http://127.0.0.1:9645', GO = 'http://127.0.0.1:8899', APP = 'http://localhost:4499';
const CHAIN = 31337;
assert(process.argv.slice(2).every(x => x === '--reset-db'), 'Only --reset-db is supported');
const runID = new Date().toISOString().replace(/[:.]/g, '-') + '-' + randomUUID().slice(0, 8);
const DIR = join(PRIVATE, runID);
process.umask(0o077);
const env = { PATH: process.env.PATH, HOME: '/root', LANG: 'C.UTF-8', TMPDIR: DIR,
  PGCONNECT_TIMEOUT: '5', PGPASSFILE: '/dev/null', NEXT_TELEMETRY_DISABLED: '1' };
const children = [], pages = {}, responseJobs = new Set();
let browser, phase = 'prerequisites', lockOwned = false;
const report = { runID, status: 'running', database: DB + ':5546', origins: { APP, GO, RPC },
  scope: 'Actual frontend DOM clicks through unmodified Next, Go, PostgreSQL and Anvil; injected local generated-key wallet only',
  checks: [], transactions: [], walletRequests: [], http: [], browserErrors: [], consoleErrors: [], requestFailures: [], screenshots: [], sourceHashes: {},
  untested: ['Real wallet extension UX, hardware wallets and ERC-1271', 'Backup handover, bilateral settlement, timeout and never-submitted refund UI', 'Adversarial stale-consent race and rejected/reverted wallet UX', 'Mobile/cross-browser/accessibility audit', 'Production deployment, public RPC, real funds, retention guarantees'] };
const json = x => JSON.stringify(x, (_, v) => typeof v === 'bigint' ? v.toString() : v, 2);
const sha = x => createHash('sha256').update(x).digest('hex');
function pass(name, evidence = {}) { report.checks.push({ name, ...evidence }); console.log('PASS ' + name); }
async function save(name, content) { await writeFile(join(DIR, name), content, { mode: 0o600 }); }
async function command(file, argv, options = {}) {
  return promisify(execFile)(file, argv, { env, timeout: 180000, maxBuffer: 8 * 1024 * 1024, ...options });
}
async function sql(query, database = DB) {
  return (await command('psql', ['-X', '-w', '-h', '/var/run/postgresql', '-p', '5546', '-U', 'root', '-d', database, '-At', '-v', 'ON_ERROR_STOP=1', '-c', query])).stdout.trim();
}
async function privateSql(query) {
  const p = spawn('psql', ['-X', '-w', '-h', '/var/run/postgresql', '-p', '5546', '-U', 'root', '-d', DB, '-v', 'ON_ERROR_STOP=1'], { env, stdio: ['pipe', 'ignore', 'pipe'] });
  const timeout = setTimeout(() => p.kill('SIGKILL'), 15000);
  p.stdin.end(query);
  try { await new Promise((yes, no) => { p.on('error', no); p.on('exit', c => c === 0 ? yes() : no(Error('Private role provisioning failed'))); }); }
  finally { clearTimeout(timeout); }
}
async function privateDir(path) {
  await mkdir(path, { recursive: true, mode: 0o700 });
  const st = await lstat(path);
  assert(st.isDirectory() && !st.isSymbolicLink() && st.uid === process.getuid() && (st.mode & 0o777) === 0o700, 'Unsafe directory ' + path);
}
async function freePort(port) {
  const s = net.createServer();
  await new Promise((yes, no) => { s.once('error', no); s.listen(port, '127.0.0.1', yes); });
  await new Promise(yes => s.close(yes));
}
async function start(name, file, argv, options = {}) {
  const log = await open(join(DIR, name + '.log'), 'wx', 0o600);
  const p = spawn(file, argv, { env, detached: true, stdio: ['ignore', log.fd, log.fd], ...options });
  children.push(p); p.on('error', e => { p.startError = e; }); await log.close(); return p;
}
async function until(probe, label, ms = 60000) {
  const end = Date.now() + ms;
  while (Date.now() < end) { if (await probe()) return; await new Promise(r => setTimeout(r, 200)); }
  throw Error('Timed out: ' + label);
}
async function ready(p, probe, name) {
  await until(async () => {
    if (p.startError || p.exitCode !== null) throw Error(name + ' exited; inspect private log');
    try { return await probe(); } catch { return false; }
  }, name + ' readiness', 180000);
}
async function stop(p) {
  if (!p?.pid) return;
  try { process.kill(-p.pid, 'SIGTERM'); } catch { return; }
  await Promise.race([new Promise(r => p.once('exit', r)), new Promise(r => setTimeout(r, 1500))]);
  try { process.kill(-p.pid, 'SIGKILL'); } catch {}
}
const excluded = name => ['node_modules', '.next', '.git', 'out', 'cache', '.toolchain', 'verification', 'tsconfig.tsbuildinfo'].includes(name) || name.startsWith('.env');
async function hashes(path, prefix = '') {
  const result = {};
  for (const e of (await readdir(path, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
    if (excluded(e.name)) continue;
    if (e.isDirectory()) Object.assign(result, await hashes(join(path, e.name), prefix + e.name + '/'));
    else if (e.isFile()) result[prefix + e.name] = sha(await readFile(join(path, e.name)));
  }
  return result;
}
async function snapshot(name) {
  const src = join(ROOT, name), dest = join(DIR, name), before = await hashes(src);
  await cp(src, dest, { recursive: true, filter: path => !path.split('/').some(excluded) });
  assert.deepEqual(await hashes(src), before, name + ' changed during snapshot');
  assert.deepEqual(await hashes(dest), before, name + ' copy mismatch');
  report.sourceHashes[name] = before; return dest;
}
async function tool(name) {
  for (const base of [join(ROOT, 'contracts/.toolchain'), '/root/.foundry/bin', '/root/.local/bin', '/root/.local/share/pactra-foundry-v1.8.3']) {
    try { const path = join(base, name), v = await command(path, ['--version']); report[name + 'Version'] = v.stdout.trim(); return path; } catch {}
  }
  throw Error('Missing local Foundry ' + name);
}
let rpcID = 0;
async function rpc(method, params = []) {
  const r = await fetch(RPC, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: ++rpcID, method, params }), signal: AbortSignal.timeout(10000) });
  assert(r.ok); const d = await r.json(); if (d.error) throw Error(method + ': ' + d.error.message); return d.result;
}
async function shot(page, name) {
  const file = name + '.png'; await page.screenshot({ path: join(DIR, file), fullPage: true });
  await save(name + '.txt', await page.locator('body').innerText()); report.screenshots.push(file);
}
async function run() {
  await privateDir(PRIVATE); await privateDir(DIR);
  const lock = await open(join(PRIVATE, 'run.lock'), 'wx', 0o600);
  lockOwned = true; await lock.writeFile(String(process.pid)); await lock.close();
  for (const port of [8899, 4499, 9645]) await freePort(port);
  const require = createRequire(join(ROOT, 'package.json'));
  const { createPublicClient, createWalletClient, http, defineChain, decodeFunctionData } = require('viem');
  const { generatePrivateKey, privateKeyToAccount } = require('viem/accounts');
  const { parseSiweMessage } = require('viem/siwe');
  const { chromium } = await import('/root/ui-research/node_modules/playwright/index.mjs');
  const accounts = {}, fixtures = {};
  for (const role of ['buyer', 'worker', 'primary', 'backup', 'attestor']) {
    const key = generatePrivateKey(); accounts[role] = privateKeyToAccount(key); fixtures[role] = { address: accounts[role].address, privateKey: key };
  }
  await save('fixtures.json', json({ purpose: 'GENERATED LOCAL TEST KEYS ONLY', fixtures }));
  await save('attestor.key', fixtures.attestor.privateKey.slice(2) + '\n');
  const [anvil, forge] = await Promise.all([tool('anvil'), tool('forge')]);
  phase = 'source-snapshot-and-isolated-build';
  const backend = await snapshot('backend'), contracts = await snapshot('contracts'), frontend = await snapshot('frontend');
  for (const file of ['package.json', 'package-lock.json']) { await cp(join(ROOT, file), join(DIR, file)); report.sourceHashes[file] = sha(await readFile(join(DIR, file))); }
  await symlink(join(ROOT, 'node_modules'), join(DIR, 'node_modules'));
  await save('source-hashes.json', json(report.sourceHashes));
  const built = await command(forge, ['build', '--offline', '--skip', 'test', '--skip', 'script'], { cwd: contracts });
  await save('forge-build.log', built.stdout + built.stderr);
  const goBuilt = await command('go', ['build', '-o', join(DIR, 'pactra-api'), './cmd/server'], { cwd: backend });
  await save('go-build.log', goBuilt.stdout + goBuilt.stderr);
  report.binarySHA256 = sha(await readFile(join(DIR, 'pactra-api')));
  const artifact = JSON.parse(await readFile(join(contracts, 'out/PactraEscrow.sol/PactraEscrow.json'), 'utf8'));
  const abi = artifact.abi;
  for (const name of ['acceptDeliverable', 'requestRevision', 'openDispute']) {
    const methods = abi.filter(x => x.type === 'function' && x.name === name);
    assert(methods.length === 1 && methods[0].inputs.length === 5, 'Guarded five-argument ABI required: ' + name);
  }
  report.contractBytecodeSHA256 = sha(artifact.bytecode.object);
  pass('Source-hashed isolated snapshot, fresh Go/contract builds and guarded review ABI');
  phase = 'isolated-database';
  const present = await sql(`SELECT count(*) FROM pg_database WHERE datname='${DB}'`, 'postgres');
  if (present === '1') {
    assert(process.argv.includes('--reset-db'), 'Database exists; explicit --reset-db required');
    assert.equal(await sql(`SELECT shobj_description(oid,'pg_database') FROM pg_database WHERE datname='${DB}'`, 'postgres'), MARKER);
    assert.equal(await sql(`SELECT count(*) FROM pg_stat_activity WHERE datname='${DB}'`, 'postgres'), '0', 'DB has active clients');
    await sql(`DROP DATABASE ${DB}`, 'postgres');
  }
  await sql(`CREATE DATABASE ${DB}`, 'postgres'); await sql(`COMMENT ON DATABASE ${DB} IS '${MARKER}'`, 'postgres');
  assert.equal(await sql('SELECT current_database()'), DB);
  for (const f of (await readdir(join(backend, 'migrations'))).filter(x => /^\d+.*\.sql$/.test(x)).sort())
    await command('psql', ['-X', '-w', '-h', '/var/run/postgresql', '-p', '5546', '-U', 'root', '-d', DB, '-v', 'ON_ERROR_STOP=1', '-f', join(backend, 'migrations', f)]);
  const role = 'pactra_ui_' + randomBytes(6).toString('hex'), password = randomBytes(32).toString('hex'); report.runtimeRole = role;
  await privateSql(`CREATE ROLE ${role} LOGIN PASSWORD '${password}' NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION;
REVOKE CONNECT ON DATABASE ${DB} FROM PUBLIC;
GRANT CONNECT ON DATABASE ${DB} TO ${role}; GRANT USAGE ON SCHEMA pactra TO ${role};
GRANT SELECT,INSERT ON ALL TABLES IN SCHEMA pactra TO ${role};
GRANT UPDATE ON pactra.tasks,pactra.challenges,pactra.challenge_limits,pactra.ai_usage_global,pactra.ai_usage_wallet TO ${role};`);
  assert.equal(await sql(`SELECT rolsuper OR rolcreatedb OR rolcreaterole FROM pg_roles WHERE rolname='${role}'`), 'f');
  pass('Isolated PostgreSQL database and restricted runtime role verified');
  phase = 'local-chain-deployment';
  const ap = await start('anvil', anvil, ['--host', '127.0.0.1', '--port', '9645', '--chain-id', String(CHAIN), '--silent']);
  await ready(ap, async () => await rpc('eth_chainId') === '0x7a69', 'anvil');
  assert((await rpc('web3_clientVersion')).toLowerCase().includes('anvil'));
  for (const a of Object.values(accounts)) await rpc('anvil_setBalance', [a.address, '0x56bc75e2d63100000']);
  const chain = defineChain({ id: CHAIN, name: 'Pactra isolated UI', nativeCurrency: { name: 'Test Ether', symbol: 'ETH', decimals: 18 }, rpcUrls: { default: { http: [RPC] } } });
  const client = createPublicClient({ chain, transport: http(RPC, { retryCount: 0 }) });
  const wallets = Object.fromEntries(Object.entries(accounts).map(([r, account]) => [r, createWalletClient({ account, chain, transport: http(RPC, { retryCount: 0 }) })]));
  const deployHash = await wallets.buyer.deployContract({ abi, bytecode: artifact.bytecode.object, args: [accounts.attestor.address] });
  const deployed = await client.waitForTransactionReceipt({ hash: deployHash }); assert.equal(deployed.status, 'success');
  const escrow = deployed.contractAddress; report.escrow = escrow; report.deploymentHash = deployHash;
  const read = (functionName, args = []) => client.readContract({ address: escrow, abi, functionName, args });
  assert.equal((await read('evidenceAttestor')).toLowerCase(), accounts.attestor.address.toLowerCase());
  phase = 'real-services';
  const runtime = { ...env, HOST: '127.0.0.1', PORT: '8899', DATABASE_URL: `postgres://${role}:${password}@127.0.0.1:5546/${DB}?sslmode=disable`,
    PACTRA_AUTH_DOMAIN: 'localhost:4499', PACTRA_AUTH_URI: APP, PACTRA_APP_ORIGIN: APP, PACTRA_CHAIN_ID: String(CHAIN),
    PACTRA_ARBITERS: [accounts.primary.address, accounts.backup.address].join(','), PACTRA_ONCHAIN_ENABLED: 'true',
    PACTRA_ONCHAIN_RPC_URL: RPC, PACTRA_ONCHAIN_ESCROW: escrow, PACTRA_ONCHAIN_CONFIRMATIONS: '1',
    PACTRA_ONCHAIN_ATTESTOR_KEY_FILE: join(DIR, 'attestor.key'), PACTRA_PUBLIC_AI_ENABLED: 'false' };
  await save('go-env-redacted.json', json({ ...runtime, DATABASE_URL: `postgres://${role}:REDACTED@127.0.0.1:5546/${DB}?sslmode=disable` }));
  const gp = await start('go', join(DIR, 'pactra-api'), [], { env: runtime });
  await ready(gp, async () => (await fetch(GO + '/ready', { signal: AbortSignal.timeout(3000) })).ok, 'go');
  const webEnv = { ...env, NODE_ENV: 'development', GO_API_URL: GO, PACTRA_APP_ORIGIN: APP, PACTRA_CHAIN_ID: String(CHAIN),
    PACTRA_CHAIN_NAME: 'Pactra LOCAL UI', PACTRA_RPC_URL: RPC, PACTRA_NATIVE_CURRENCY_NAME: 'Test Ether',
    PACTRA_NATIVE_CURRENCY_SYMBOL: 'ETH', PACTRA_NATIVE_CURRENCY_DECIMALS: '18', PACTRA_ARBITERS: runtime.PACTRA_ARBITERS, PACTRA_PUBLIC_AI_ENABLED: 'false' };
  await save('web-env.json', json(webEnv));
  const wp = await start('web', process.execPath, [require.resolve('next/dist/bin/next'), 'dev', '--webpack', '--hostname', '127.0.0.1', '--port', '4499'], { cwd: frontend, env: webEnv });
  await ready(wp, async () => { const r = await fetch(APP + '/api/workspace/me', { signal: AbortSignal.timeout(5000) }); await r.body?.cancel(); return r.status === 401; }, 'web');
  pass('Real local Anvil deployment and Next/Go readiness; no shared build output');
  browser = await chromium.launch({ executablePath: '/root/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome', headless: true, args: ['--no-sandbox'] });
  async function newActor(role) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1050 }, reducedMotion: 'reduce' });
    // Only wallet metadata is emulated. All chain reads and writes use the real local node.
    let connected = false;
    await context.exposeBinding('__pactraLocalWallet', async ({ page }, request) => {
      assert.equal(new URL(page.url()).origin, APP, 'Wallet request from foreign origin');
      const { method, params = [] } = request;
      report.walletRequests.push({ role, method });
      const address = accounts[role].address;
      if (method === 'eth_requestAccounts') { connected = true; return [address]; }
      if (method === 'eth_accounts') return connected ? [address] : [];
      if (method === 'eth_chainId') return rpc(method);
      if (method === 'net_version') return rpc(method);
      if (method === 'wallet_getPermissions' || method === 'wallet_requestPermissions') return [{ parentCapability: 'eth_accounts', caveats: [{ type: 'restrictReturnedAccounts', value: [address] }] }];
      if (method === 'wallet_switchEthereumChain') { assert.equal(params[0].chainId.toLowerCase(), '0x7a69'); return null; }
      if (method === 'wallet_revokePermissions') return null;
      if (method === 'personal_sign') {
        assert.equal(params[1].toLowerCase(), address.toLowerCase());
        const message = Buffer.from(params[0].slice(2), 'hex').toString('utf8'), siwe = parseSiweMessage(message);
        assert(siwe.domain === 'localhost:4499' && siwe.uri === APP && siwe.chainId === CHAIN && siwe.address.toLowerCase() === address.toLowerCase(), 'Refusing nonlocal SIWE');
        return accounts[role].signMessage({ message });
      }
      if (method === 'eth_sendTransaction') {
        const tx = params[0]; assert.equal(tx.from.toLowerCase(), address.toLowerCase()); assert.equal(tx.to.toLowerCase(), escrow.toLowerCase());
        if (tx.chainId) assert.equal(BigInt(tx.chainId), BigInt(CHAIN));
        const decoded = decodeFunctionData({ abi, data: tx.data });
        const hash = await wallets[role].sendTransaction({ to: escrow, data: tx.data, value: BigInt(tx.value || '0x0'), ...(tx.gas ? { gas: BigInt(tx.gas) } : {}) });
        const receipt = await client.waitForTransactionReceipt({ hash, timeout: 20000 });
        assert.equal(receipt.status, 'success'); assert.equal((await client.getBlock({ blockNumber: receipt.blockNumber })).hash, receipt.blockHash);
        report.transactions.push({ role, method: decoded.functionName, args: decoded.args, value: BigInt(tx.value || '0x0'), hash, blockNumber: receipt.blockNumber, blockHash: receipt.blockHash, gasUsed: receipt.gasUsed, effectiveGasPrice: receipt.effectiveGasPrice, status: receipt.status });
        return hash;
      }
      if (/^(eth_call|eth_estimateGas|eth_getBalance|eth_getCode|eth_getTransactionCount|eth_getTransactionByHash|eth_getTransactionReceipt|eth_getBlockByNumber|eth_getBlockByHash|eth_blockNumber|eth_gasPrice|eth_maxPriorityFeePerGas|eth_feeHistory)$/.test(method)) return rpc(method, params);
      throw Error('Unsupported local wallet method: ' + method);
    });
    await context.addInitScript(() => {
      const listeners = new Map();
      const provider = { isMetaMask: true, isConnected: () => true,
        request: request => window.__pactraLocalWallet(request),
        on: (name, fn) => { if (!listeners.has(name)) listeners.set(name, new Set()); listeners.get(name).add(fn); },
        removeListener: (name, fn) => listeners.get(name)?.delete(fn) };
      Object.defineProperty(window, 'ethereum', { value: provider, configurable: false });
    });
    const page = await context.newPage(); pages[role] = page; page.setDefaultTimeout(45000);
    await page.route('**/*', route => {
      const url = new URL(route.request().url());
      if (['http:', 'https:'].includes(url.protocol) && ![APP, RPC].includes(url.origin)) {
        report.requestFailures.push({ role, url: url.href, error: 'External request blocked; no response fabricated' }); return route.abort('blockedbyclient');
      }
      return route.continue();
    });
    page.on('pageerror', e => report.browserErrors.push({ role, error: e.message }));
    page.on('console', m => { if (m.type() === 'error') report.consoleErrors.push({ role, text: m.text() }); });
    page.on('requestfailed', r => report.requestFailures.push({ role, url: r.url(), error: r.failure()?.errorText }));
    page.on('response', response => {
      if (!response.url().startsWith(APP + '/api/workspace/')) return;
      const job = (async () => { let body; try { body = await response.json(); } catch {}
        const path = new URL(response.url()).pathname;
        report.http.push({ role, path, method: response.request().method(), status: response.status(), ...(response.status() >= 400 ? { body } : {}) });
      })(); responseJobs.add(job); job.finally(() => responseJobs.delete(job));
    });
    await page.goto(APP + (role === 'primary' ? '/arbiter' : '/tasks'), { waitUntil: 'domcontentloaded', timeout: 180000 });
    await page.getByRole('button', { name: 'Connect wallet', exact: true }).first().click();
    const modal = page.getByRole('dialog');
    await modal.getByRole('button', { name: /Injected|MetaMask|Browser Wallet/i }).first().click();
    await page.getByRole('button', { name: 'Sign in', exact: true }).first().click();
    await page.getByRole('button', { name: 'Sign out', exact: true }).first().waitFor();
    const cookies = await context.cookies(APP); const session = cookies.find(x => x.name === 'pactra_session');
    assert(session?.httpOnly && session.sameSite === 'Strict', 'Actual session cookie flags');
    await shot(page, role + '-signed-in'); pass(role + ' connected and signed in through actual wallet controls with genuine SIWE');
    return page;
  }
  phase = 'buyer-worker-ui-login';
  const buyer = await newActor('buyer'), worker = await newActor('worker');
  async function acknowledge(page, label = 'Continue to wallet') {
    const dialog = page.getByRole('dialog'); await dialog.waitFor();
    assert(await dialog.getByRole('button', { name: label, exact: true }).isDisabled(), 'Acknowledgement gate missing');
    await dialog.getByRole('checkbox').check(); await dialog.getByRole('button', { name: label, exact: true }).click();
  }
  phase = 'ui-create-invitation';
  await buyer.goto(APP + '/tasks/new', { waitUntil: 'domcontentloaded' });
  await buyer.getByLabel('Task title', { exact: true }).fill('LOCAL UI settlement ' + runID);
  await buyer.getByLabel('Source JSON', { exact: true }).fill('{"greeting":"Hello"}');
  await buyer.getByLabel('Delivery deadline (UTC)', { exact: true }).fill(new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 16));
  await buyer.getByLabel('Worker address', { exact: true }).fill(accounts.worker.address);
  await buyer.getByLabel('Primary arbiter', { exact: true }).selectOption(accounts.primary.address.toLowerCase());
  await buyer.getByLabel('Backup arbiter', { exact: true }).selectOption(accounts.backup.address.toLowerCase());
  const names = ['accepted', 'disputed'];
  for (let i = 0; i < names.length; i++) {
    if (i) await buyer.getByRole('button', { name: 'Add deliverable', exact: true }).click();
    const field = name => buyer.locator(`[id="deliverables.${i}.${name}"]`);
    await field('id').fill(names[i]); await field('title').fill('UI ' + names[i]);
    await field('criteria').fill('Buyer can retrieve the exact persisted JSON; human review required.');
    await field('amount_base_units').fill('1000'); await field('revision_limit').selectOption('2'); await field('review_period_hours').fill('24');
  }
  await buyer.getByRole('button', { name: 'Review agreement', exact: true }).click();
  await buyer.getByRole('heading', { name: 'Review before creating', exact: true }).waitFor();
  await buyer.getByRole('button', { name: 'Create invitation', exact: true }).click();
  await acknowledge(buyer, 'Confirm invitation');
  await buyer.waitForURL(/\/tasks\/[a-f0-9-]{36}$/);
  const taskID = new URL(buyer.url()).pathname.split('/').at(-1); assert(/^[a-f0-9-]{36}$/.test(taskID)); report.taskID = taskID;
  assert.equal(await sql(`SELECT count(*) FROM pactra.tasks WHERE id='${taskID}'`), '1');
  await shot(buyer, 'invitation-created');
  await worker.goto(buyer.url(), { waitUntil: 'domcontentloaded' });
  await worker.getByRole('button', { name: 'Accept agreement', exact: true }).click();
  await worker.getByRole('dialog').getByRole('button', { name: 'Confirm acceptance', exact: true }).click();
  await worker.getByText('Acceptance confirmed by the server. This task is unfunded.', { exact: true }).waitFor();
  await buyer.getByRole('button', { name: 'Read current task', exact: true }).click();
  pass('Buyer created immutable two-allocation invitation and worker accepted through real forms', { taskID });
  const panel = page => page.getByRole('region', { name: 'Onchain task actions', exact: true });
  const allocation = (page, i) => panel(page).locator('section').filter({ has: page.getByRole('heading', { name: 'UI ' + names[i], exact: true }) });
  async function chainAction(page, role, label, method, scope = panel(page)) {
    phase = 'ui-' + method;
    const before = report.transactions.length;
    await scope.getByRole('button', { name: label, exact: true }).click();
    const dialog = page.getByRole('dialog'); await dialog.waitFor();
    if (['acceptDeliverable', 'requestRevision', 'openDispute'].includes(method)) {
      assert((await dialog.innerText()).includes('Review round:')); assert((await dialog.innerText()).includes('submittedAt:'));
    }
    await shot(page, role + '-' + method + '-' + before + '-confirmation');
    await acknowledge(page);
    await until(() => report.transactions.length > before, method + ' real wallet transaction', 90000);
    const tx = report.transactions.at(-1); assert.equal(tx.role, role); assert.equal(tx.method, method);
    if (['acceptDeliverable', 'requestRevision', 'openDispute'].includes(method)) assert.equal(tx.args.length, 5);
    await page.getByText(method === 'resolveDispute' ? 'Confirmed receipt and allocation readback succeeded. Refresh evidence before another action.' : 'Confirmed receipt and authoritative readback succeeded.', { exact: true }).waitFor({ timeout: 90000 });
    await shot(page, role + '-' + method + '-' + before + '-confirmed');
    pass('UI ' + role + ' ' + method + ': real successful receipt and UI authoritative readback', { hash: tx.hash }); return tx;
  }
  await chainAction(buyer, 'buyer', 'Create onchain agreement', 'createTask');
  const binding = JSON.parse(await sql(`SELECT row_to_json(b) FROM pactra.onchain_bindings b WHERE task_id='${taskID}'`));
  report.binding = binding; const id = BigInt(binding.onchain_task_id); report.onchainTaskID = id;
  await panel(worker).getByRole('button', { name: 'Read chain state', exact: true }).click();
  await chainAction(worker, 'worker', 'Accept onchain terms', 'acceptTask');
  await panel(buyer).getByRole('button', { name: 'Read chain state', exact: true }).click();
  await chainAction(buyer, 'buyer', 'Fund exact allocation total', 'fundTask');
  assert.equal(await client.getBalance({ address: escrow }), 2000n);
  await panel(worker).getByRole('button', { name: 'Read chain state', exact: true }).click();
  async function persist(i, version) {
    phase = 'ui-persist-artifact-' + i + '-v' + version;
    const evidence = worker.getByRole('region', { name: 'Voluntary unfunded work review', exact: true }).getByRole('region', { name: 'UI ' + names[i], exact: true });
    await evidence.getByRole('button', { name: 'Read current review', exact: true }).click();
    const artifact = { greeting: 'Hello UI ' + names[i] + ' v' + version };
    await evidence.getByLabel('Artifact · raw JSON', { exact: true }).fill(JSON.stringify(artifact));
    await evidence.getByRole('button', { name: 'Review submission', exact: true }).click();
    await acknowledge(worker, 'Confirm submit voluntary work');
    await evidence.getByText('Intent confirmed; current server history loaded.', { exact: true }).waitFor();
    await evidence.getByRole('heading', { name: 'Version ' + version + ' · latest', exact: true }).waitFor();
    await chainAction(worker, 'worker', 'Submit persisted artifact onchain', 'submitDeliverable', allocation(worker, i));
    const ev = await read('getDeliveryEvidence', [id, BigInt(i)]); assert.equal(ev[2], '0x' + sha(JSON.stringify(artifact)));
    const buyerEvidence = buyer.getByRole('region', { name: 'Voluntary unfunded work review', exact: true }).getByRole('region', { name: 'UI ' + names[i], exact: true });
    await buyerEvidence.getByRole('button', { name: 'Read current review', exact: true }).click();
    const article = buyerEvidence.getByRole('article').filter({ has: buyer.getByRole('heading', { name: 'Version ' + version + ' · latest', exact: true }) });
    await article.getByText('View stored artifact JSON', { exact: true }).click();
    await article.locator('pre').filter({ hasText: artifact.greeting }).waitFor();
    await shot(buyer, 'buyer-readable-artifact-' + i + '-v' + version);
    pass('UI persisted and buyer opened exact artifact ' + names[i] + ' version ' + version + '; real attested chain hash matched');
  }
  await persist(0, 1);
  await panel(buyer).getByRole('button', { name: 'Read chain state', exact: true }).click();
  await chainAction(buyer, 'buyer', 'Request revision onchain', 'requestRevision', allocation(buyer, 0));
  await panel(worker).getByRole('button', { name: 'Read chain state', exact: true }).click();
  await persist(0, 2);
  await panel(buyer).getByRole('button', { name: 'Read chain state', exact: true }).click();
  await chainAction(buyer, 'buyer', 'Accept and allocate payment', 'acceptDeliverable', allocation(buyer, 0));
  assert.equal(await read('balances', [accounts.worker.address]), 1000n);
  await persist(1, 1);
  await panel(buyer).getByRole('button', { name: 'Read chain state', exact: true }).click();
  await chainAction(buyer, 'buyer', 'Open onchain dispute', 'openDispute', allocation(buyer, 1));
  phase = 'ui-arbiter-discovery';
  const primary = await newActor('primary');
  await primary.getByRole('button', { name: 'Read scoped evidence', exact: true }).click();
  await primary.getByText('Source and versioned evidence', { exact: true }).click();
  await primary.getByRole('region', { name: 'Dispute evidence', exact: true }).locator('pre').filter({ hasText: 'Hello UI disputed v1' }).waitFor();
  await primary.getByLabel('Worker award · exact native base units', { exact: true }).fill('700');
  await shot(primary, 'arbiter-scoped-evidence');
  await chainAction(primary, 'primary', 'Resolve allocation', 'resolveDispute', primary.getByRole('region', { name: 'Dispute evidence', exact: true }));
  const settled = await read('getDeliverable', [id, 1n]); assert.equal(settled[3], 3); assert.equal(settled[8], 700n); assert.equal(settled[9], 300n);
  await primary.getByRole('button', { name: 'Refresh queue', exact: true }).click();
  await primary.getByRole('heading', { name: 'No nominated disputes returned', exact: true }).waitFor();
  pass('Actual nominated arbiter UI discovered scoped evidence, resolved 700/300 split and queue cleared');
  for (const [role, page, credit] of [['worker', worker, 1700n], ['buyer', buyer, 300n]]) {
    await panel(page).getByRole('button', { name: 'Read chain state', exact: true }).click();
    assert.equal(await read('balances', [accounts[role].address]), credit);
    const before = await client.getBalance({ address: accounts[role].address });
    const tx = await chainAction(page, role, 'Withdraw available balance', 'withdraw');
    const after = await client.getBalance({ address: accounts[role].address });
    assert.equal(after, before + credit - tx.gasUsed * tx.effectiveGasPrice); assert.equal(await read('balances', [accounts[role].address]), 0n);
  }
  assert.equal(await client.getBalance({ address: escrow }), 0n); assert.equal((await read('getTask', [id]))[6], 3);
  pass('Actual buyer/worker UI withdrawals verified with gas-adjusted balances; escrow empty and task completed');
  report.persisted = JSON.parse(await sql(`SELECT json_build_object('bindings',(SELECT count(*) FROM pactra.onchain_bindings),'receipts',(SELECT count(*) FROM pactra.availability_attestations),'delivery_events',(SELECT count(*) FROM pactra.delivery_events))`));
  assert.equal(report.persisted.bindings, 1); assert.equal(report.persisted.receipts, 3);
  phase = 'final-verification';
  await Promise.all([...responseJobs]);
  assert.deepEqual(report.browserErrors, [], 'Uncaught browser exceptions captured');
  const unexpected = report.http.filter(r => r.status >= 400 && !(r.status === 401 && r.path.endsWith('/me')) && !(r.status === 404 && r.path.endsWith('/onchain')));
  report.unexpectedHTTP = unexpected; assert.deepEqual(unexpected, [], 'Unexpected real backend HTTP errors');
  report.sourceDrift = {};
  for (const name of ['backend', 'contracts', 'frontend']) {
    const current = await hashes(join(ROOT, name)), frozen = report.sourceHashes[name];
    report.sourceDrift[name] = [...new Set([...Object.keys(current), ...Object.keys(frozen)])].filter(k => current[k] !== frozen[k]);
  }
  pass('No uncaught browser exceptions or unexpected workspace HTTP errors; source drift recorded');
  report.status = 'passed';
}
async function finish() {
  await Promise.allSettled([...responseJobs]);
  if (browser) await browser.close().catch(() => {});
  for (const p of children.reverse()) await stop(p);
  if (report.runtimeRole) {
    try { await sql(`DROP OWNED BY ${report.runtimeRole}; DROP ROLE ${report.runtimeRole};`); assert.equal(await sql(`SELECT count(*) FROM pg_roles WHERE rolname='${report.runtimeRole}'`), '0'); report.runtimeRoleRemoved = true; }
    catch (e) { report.cleanupError = e.message; report.status = 'failed'; process.exitCode = 1; }
  }
  report.stopped = true;
  await save('report.json', json(report));
  const lines = [report.status.toUpperCase() + ': Pactra actual UI settlement acceptance', '', 'Run: ' + runID,
    'Scope: ' + report.scope, 'Database: ' + report.database, 'Origins: ' + json(report.origins),
    'Private evidence: ' + DIR, 'Machine report: ' + join(DIR, 'report.json'),
    'Reproduce: node scripts/settlement-ui-e2e.mjs --reset-db', '', 'Passed:', ...report.checks.map(c => '- ' + c.name), '',
    'Actual UI-triggered successful transaction count: ' + report.transactions.length,
    'Screenshots captured: ' + report.screenshots.length,
    'Uncaught browser errors: ' + report.browserErrors.length,
    'Console error entries (inspect report, includes expected initial 401/unbound 404): ' + report.consoleErrors.length,
    ...(report.error ? ['', 'FAILED phase: ' + report.phase, report.error, 'Downstream steps were not completed; only the explicit checks above passed.'] : []),
    '', 'Untested:', ...report.untested.map(x => '- ' + x), '',
    'Source identity: per-file SHA-256 in source-hashes.json. Only this snapshot is tested, not later worker changes.',
    'Source drift at finish: ' + json(report.sourceDrift || 'Not reached; inspect frozen hashes.'),
    'All harness service process groups stopped. Disposable DB retained; restricted login role removed: ' + Boolean(report.runtimeRoleRemoved) + '.',
    'No shared .next writes, other worker ports/DB touched, public deployment, or real user wallet keys.',
    ...(report.cleanupError ? ['CLEANUP ERROR: ' + report.cleanupError] : []), ''];
  await writeFile(RESULT, lines.join('\n'), { mode: 0o600 });
  if (lockOwned) await unlink(join(PRIVATE, 'run.lock'));
  console.log('RESULT ' + RESULT + '\nEVIDENCE ' + DIR);
}
const watchdog = setTimeout(() => {
  report.status = 'failed'; report.phase = phase; report.error = '20-minute global deadline exceeded';
  for (const p of children) { try { process.kill(-p.pid, 'SIGKILL'); } catch {} }
  Promise.allSettled([save('report.json', json(report)), writeFile(RESULT, 'FAILED: UI deadline exceeded. No complete pass. Evidence: ' + DIR + '\n', { mode: 0o600 })]).finally(() => process.exit(1));
}, 20 * 60 * 1000);
try { await run(); }
catch (e) {
  report.status = 'failed'; report.phase = phase; report.error = e.stack || e.message; process.exitCode = 1;
  console.error('FAIL ' + phase + ': ' + e.message);
  for (const [role, page] of Object.entries(pages)) { try { await shot(page, 'FAIL-' + role); } catch {} }
}
finally { try { await finish(); } finally { clearTimeout(watchdog); } }

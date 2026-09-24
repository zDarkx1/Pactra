#!/usr/bin/env node
// LOCAL TEST ONLY. Never load real wallet keys or point this at a public release.
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';
import { constants } from 'node:fs';
import { open, mkdir, lstat, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(join(root, 'frontend/package.json'));
const { generatePrivateKey, privateKeyToAccount } = require('viem/accounts');
const { parseSiweMessage } = require('viem/siwe');
const FIXTURES = '/root/ui-research/pactra-e2e-fixtures.json';
const OUTPUT = '/root/.hermes/output/pactra-workspace';
const APP = 'http://localhost:3999';
const GO = 'http://127.0.0.1:8499';
const ROLES = ['buyer', 'worker', 'primary', 'backup', 'outsider'];
const runID = new Date().toISOString().replace(/[:.]/g, '-') + '-' + randomUUID().slice(0, 8);
const runDir = join(OUTPUT, runID);
class Failure extends Error { constructor(code) { super(code); this.code = code; } }
function check(condition, code) { if (!condition) throw new Failure(code); }
async function fixtures(prepare = false) {
  if (prepare) {
    await mkdir(dirname(FIXTURES), { recursive: true });
    let file;
    try { file = await open(FIXTURES, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600); }
    catch (error) { if (error.code !== 'EEXIST') throw new Failure('fixture-create-failed'); }
    if (file) {
      try {
        const identities = Object.fromEntries(ROLES.map(role => {
          const privateKey = generatePrivateKey();
          return [role, { address: privateKeyToAccount(privateKey).address, privateKey }];
        }));
        await file.writeFile(JSON.stringify({ version: 1, purpose: 'LOCAL E2E TEST ONLY — NEVER PUBLIC RELEASE', identities }, null, 2) + '\n');
        await file.sync();
      } finally { await file.close(); }
    }
  }
  const stat = await lstat(FIXTURES).catch(() => { throw new Failure('run-prepare-fixtures-first'); });
  check(stat.isFile() && !stat.isSymbolicLink() && (stat.mode & 0o777) === 0o600 && stat.uid === process.getuid(), 'fixture-must-be-owned-regular-mode600');
  const file = await open(FIXTURES, constants.O_RDONLY | constants.O_NOFOLLOW);
  let value;
  try { value = JSON.parse(await file.readFile('utf8')); } finally { await file.close(); }
  check(value.version === 1 && value.identities, 'fixture-schema');
  const accounts = {};
  for (const role of ROLES) {
    const identity = value.identities[role];
    check(identity && /^0x[0-9a-f]{64}$/i.test(identity.privateKey), 'fixture-key-format');
    accounts[role] = privateKeyToAccount(identity.privateKey);
    check(accounts[role].address === identity.address, 'fixture-address-mismatch');
  }
  check(new Set(Object.values(accounts).map(a => a.address)).size === ROLES.length, 'fixture-identities-not-distinct');
  return accounts;
}

async function main() {
  if (process.argv.includes('--prepare-fixtures')) {
    const accounts = await fixtures(true);
    console.log('LOCAL TEST ONLY — never configure these identities on a public release.');
    console.log('Fixture file: ' + FIXTURES);
    for (const role of ROLES) console.log(role + '=' + accounts[role].address);
    console.log('PACTRA_ARBITERS=' + [accounts.primary.address, accounts.backup.address].join(','));
    return;
  }
  check(process.argv.slice(2).every(a => a === '--api-auth'), 'unknown-option');
  await run();
}

async function run() {
  await mkdir(runDir, { recursive: true, mode: 0o700 });
  const report = { runID, testOnly: true, app: APP, backend: GO, database: 'pactra_e2e:5546',
    wallet: 'Injected EIP-1193 TEST wallet; real ephemeral secp256k1 signatures; NOT extension QA',
    authMode: process.argv.includes('--api-auth') ? 'API SIWE + browser cookies (UI sign-in not tested)' : 'UI connect + UI SIWE sign-in',
    checks: [], screenshots: [], http: [], errors: [], expectedDiagnostics: [], status: 'running' };
  let browser;
  let phase = 'prerequisites';
  const pass = (name, evidence = {}) => { report.checks.push({ name, ...evidence }); console.log('PASS ' + name); };
  const save = async () => writeFile(join(runDir, 'report.json'), JSON.stringify(report, null, 2) + '\n', { mode: 0o600 });
  const sql = async query => {
    try {
      const { stdout } = await promisify(execFile)('psql', ['-X', '-w', '-h', '/var/run/postgresql', '-p', '5546', '-d', 'pactra_e2e', '-At', '-v', 'ON_ERROR_STOP=1', '-c', query],
        { timeout: 10000, env: { PATH: process.env.PATH, HOME: '/nonexistent', PGCONNECT_TIMEOUT: '5', PGPASSFILE: '/dev/null' } });
      return stdout.trim();
    } catch { throw new Failure('local-db-readback-failed'); }
  };
  try {
    const accounts = await fixtures();
    for (const url of [APP + '/tasks', GO + '/health']) {
      const response = await fetch(url, { signal: AbortSignal.timeout(10000), redirect: 'error' }).catch(() => { throw new Failure('local-server-not-ready'); });
      check(response.ok, 'local-readiness-http-' + response.status);
      await response.body?.cancel();
    }
    check(await sql('SELECT current_database()') === 'pactra_e2e', 'wrong-local-db');
    const { chromium } = await import('/root/ui-research/node_modules/playwright/index.mjs');
    browser = await chromium.launch({ executablePath: '/root/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome', headless: true, args: ['--no-sandbox', '--disable-background-networking'] });
    const contexts = [];
    let chainID;
    const api = async (actor, path, method = 'GET', body, expected = 200, extra = {}, discard = false) => {
      const result = await actor.page.evaluate(async ({ path, method, body, headers, discard }) => {
        try {
          const r = await fetch('/api/workspace' + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), credentials: 'same-origin', cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(20000) });
          // Deliberately discard the genuine response, never intercept or fulfill routes.
          if (discard) { await r.body?.cancel(); return { status: r.status, discarded: true }; }
          if (!r.ok || r.status === 204) { await r.body?.cancel(); return { status: r.status }; }
          return { status: r.status, data: await r.json() };
        } catch { return { status: 0 }; }
      }, { path, method, body, discard, headers: { 'Content-Type': 'application/json', 'X-Pactra-Address': accounts[actor.role].address.toLowerCase(), 'X-Pactra-Chain': String(chainID), ...extra } });
      report.http.push({ role: actor.role, path, method, status: result.status, expected, discarded: discard });
      check(result.status === expected, 'http-' + method + '-' + path.split('?')[0] + '-expected-' + expected + '-got-' + result.status);
      return result.data;
    };
    const sign = async (role, message) => {
      const parsed = parseSiweMessage(message);
      check(parsed.domain === 'localhost:3999' && parsed.uri === APP && parsed.address?.toLowerCase() === accounts[role].address.toLowerCase()
        && parsed.version === '1' && parsed.statement === 'Sign in to Pactra.' && parsed.chainId === chainID
        && parsed.expirationTime > new Date(), 'test-wallet-refused-nonlocal-or-invalid-siwe');
      return accounts[role].signMessage({ message });
    };
    const shot = async (actor, name) => {
      await actor.page.screenshot({ path: join(runDir, name + '.png'), fullPage: true });
      report.screenshots.push(name + '.png');
    };
    const inspect = async (page, name) => {
      // DOM evidence is only public UI control text, never inputs, cookies or request bodies.
      const controls = await page.getByRole('button').allTextContents();
      await writeFile(join(runDir, name + '-controls.json'), JSON.stringify(controls, null, 2), { mode: 0o600 });
    };
    const actors = {};
    async function actor(role) {
      const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, reducedMotion: 'reduce', serviceWorkers: 'block' });
      contexts.push(context);
      // Restrict real outgoing browser requests to the two authorized local origins.
      // No API mocking: local requests continue untouched; external traffic fails closed.
      await context.route('**/*', route => [APP, GO].includes(new URL(route.request().url()).origin) ? route.continue() : route.abort('blockedbyclient'));
      const page = await context.newPage();
      page.setDefaultTimeout(12000);
      page.setDefaultNavigationTimeout(25000);
      page.on('requestfailed', request => {
        const local = [APP, GO].includes(new URL(request.url()).origin);
        const aborted = request.failure()?.errorText === 'net::ERR_ABORTED';
        (local && !aborted ? report.errors : report.expectedDiagnostics).push({ role, kind: !local ? 'external-request-blocked' : aborted ? 'navigation-or-identity-abort' : 'local-request-failed', path: local ? new URL(request.url()).pathname : '[external URL withheld]' });
      });
      page.on('pageerror', () => report.errors.push({ role, kind: 'uncaught-page-error' }));
      page.on('console', message => {
        if (message.type() !== 'error') return;
        // Chromium logs expected auth/privacy denial resources; never retain raw console text.
        if (/^Failed to load resource: the server responded with a status of (401|403|404|409)\b/.test(message.text())) return;
        const networkCode = message.text().match(/^Failed to load resource: (net::[A-Z_]+)/)?.[1];
        if (networkCode === 'net::ERR_BLOCKED_BY_CLIENT') {
          report.expectedDiagnostics.push({ role, kind: 'external-block-console' }); return;
        }
        report.errors.push({ role, kind: 'console-error', category: networkCode || (/hydrat/i.test(message.text()) ? 'hydration' : /aria|accessib/i.test(message.text()) ? 'accessibility' : /^Failed to load resource:/.test(message.text()) ? 'resource-other' : 'other'), location: (() => { try { return new URL(message.location().url).origin; } catch { return 'unknown'; } })() });
      });
      await page.goto(APP + '/tasks');
      const a = { role, page, context };
      actors[role] = a;
      // A real challenge discovers the configured chain, not an invented RPC response.
      const challenge = await api(a, '/auth/challenge', 'POST', { address: accounts[role].address }, 201);
      const parsed = parseSiweMessage(challenge.message);
      if (chainID === undefined) chainID = parsed.chainId;
      check(Number.isSafeInteger(chainID) && chainID > 0 && parsed.chainId === chainID, 'invalid-local-chain');
      a.selectedRole = role;
      await page.exposeFunction('__pactraTestSign', async (hex, address) => {
        check(typeof hex === 'string' && /^0x(?:[a-f0-9]{2})+$/i.test(hex) && typeof address === 'string'
          && address.toLowerCase() === accounts[a.selectedRole].address.toLowerCase(), 'test-wallet-sign-parameters');
        return sign(a.selectedRole, Buffer.from(hex.slice(2), 'hex').toString('utf8'));
      });
      await context.addInitScript(({ address, chain }) => {
        const listeners = new Map();
        let activeAddress = address, activeChain = chain;
        let connected = sessionStorage.getItem('pactra-test-connected') === 'yes';
        const emit = (event, data) => { for (const fn of listeners.get(event) || []) fn(data); };
        const provider = {
          isPactraTestWallet: true,
          on(event, fn) { if (!listeners.has(event)) listeners.set(event, new Set()); listeners.get(event).add(fn); return this; },
          removeListener(event, fn) { listeners.get(event)?.delete(fn); return this; },
          removeAllListeners(event) { if (event) listeners.delete(event); else listeners.clear(); return this; },
          async request({ method, params = [] }) {
            if (method === 'eth_requestAccounts') { connected = true; sessionStorage.setItem('pactra-test-connected', 'yes'); return [activeAddress]; }
            if (method === 'eth_accounts') return connected ? [activeAddress] : [];
            if (method === 'eth_chainId') return '0x' + activeChain.toString(16);
            if (method === 'net_version') return String(activeChain);
            if (method === 'personal_sign') return window.__pactraTestSign(params[0], params[1]);
            if (method === 'wallet_requestPermissions') return [{ parentCapability: 'eth_accounts' }];
            if (method === 'wallet_getPermissions') return [{ parentCapability: 'eth_accounts' }];
            if (method === 'wallet_switchEthereumChain') throw Object.assign(new Error('TEST wallet: use explicit harness chain event'), { code: 4902 });
            throw Object.assign(new Error('Unsupported TEST wallet method'), { code: 4200 });
          },
        };
        Object.defineProperty(window, 'ethereum', { value: provider, configurable: false });
        window.__pactraTestWallet = {
          account(address) { activeAddress = address; emit('accountsChanged', [address]); },
          chain(id) { activeChain = id; emit('chainChanged', '0x' + id.toString(16)); },
        };
        const announce = () => window.dispatchEvent(new CustomEvent('eip6963:announceProvider', { detail: {
          info: { uuid: 'f440ab83-c593-489e-98a0-135e45c148e2', name: 'Pactra LOCAL TEST Wallet', rdns: 'test.local.pactra', icon: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg"/>' }, provider,
        } }));
        window.addEventListener('eip6963:requestProvider', announce);
        announce();
        window.addEventListener('DOMContentLoaded', () => {
          const label = document.createElement('div');
          label.textContent = 'LOCAL E2E · INJECTED TEST WALLET · NOT EXTENSION QA · NO FUNDS';
          label.style.cssText = 'position:fixed;bottom:0;left:0;right:0;z-index:2147483647;background:#ffe9ac;color:#111;font:11px sans-serif;padding:4px;text-align:center;pointer-events:none';
          document.body.append(label);
        });
      }, { address: accounts[role].address, chain: chainID });
      if (process.argv.includes('--api-auth')) {
        const signature = await sign(role, challenge.message);
        await api(a, '/auth/verify', 'POST', { challenge_id: challenge.challenge_id, signature });
      }
      await page.reload();
      await inspect(page, role + '-before-connect');
      await page.getByRole('button', { name: 'Connect wallet', exact: true }).first().click();
      await inspect(page, role + '-wallet-picker');
      const choice = page.getByRole('button', { name: /Pactra LOCAL TEST Wallet|Injected|Browser Wallet/i }).first();
      if (await choice.count()) await choice.click();
      if (!process.argv.includes('--api-auth')) {
        const button = page.getByRole('button', { name: 'Sign in', exact: true }).first();
        await button.waitFor({ state: 'visible' });
        await button.click();
      }
      await page.getByRole('button', { name: 'Sign out', exact: true }).first().waitFor({ state: 'visible' });
      const me = await api(a, '/me');
      check(me.address === accounts[role].address.toLowerCase(), 'signed-in-wrong-account');
      const cookies = await context.cookies(APP);
      check(cookies.some(c => c.name === 'pactra_session' && c.httpOnly && c.sameSite === 'Strict'), 'session-cookie-flags');
      check(!(await page.evaluate(() => document.cookie)).includes('pactra_session='), 'session-readable-by-page');
      pass(role + '-authenticated', { via: report.authMode });
      await shot(a, role + '-signed-in');
      return a;
    }
    phase = 'buyer-ui-sign-in';
    const buyer = await actor('buyer');
    const title = 'LOCAL TEST ONLY ' + runID;
    const payload = { title, source: { greeting: 'Hello', action: 'Continue' }, worker: accounts.worker.address,
      primary_arbiter: accounts.primary.address, backup_arbiter: accounts.backup.address,
      delivery_deadline: new Date(Date.now() + 7 * 86400000).toISOString().replace(/\.\d{3}Z$/, 'Z'),
      deliverables: ['copy', 'dispute'].map(id => ({ id, title: id === 'copy' ? 'TEST copy revision' : 'TEST dispute flag', criteria: 'Local voluntary review only; metadata evidence is not financial settlement.', amount_base_units: '1', revision_limit: 2, review_period_hours: 24 })) };
    phase = 'api-create-and-uncertain-retry';
    const key = randomUUID();
    await api(buyer, '/tasks', 'POST', payload, 201, { 'Idempotency-Key': key }, true);
    const task = await api(buyer, '/tasks', 'POST', payload, 201, { 'Idempotency-Key': key });
    check(/^[a-f0-9-]{36}$/.test(task.id) && task.status === 'invited', 'created-task-invalid');
    report.task = { id: task.id, title, manifest_hash: task.manifest_hash };
    check(await sql(`SELECT count(*) FROM pactra.tasks WHERE id='${task.id}'::uuid`) === '1', 'created-task-not-in-isolated-db');
    await api(buyer, '/tasks', 'POST', { ...payload, title: title + ' changed' }, 409, { 'Idempotency-Key': key });
    pass('create-retry-real-BFF-and-DB', { via: process.argv.includes('--api-auth') ? 'API after API SIWE authentication' : 'API after UI authentication', uncertainty: 'Genuine response body deliberately discarded; not an actual network outage' });
    // A second genuine task guarantees pagination even on a fresh database.
    const second = await api(buyer, '/tasks', 'POST', { ...payload, title: title + ' pagination' }, 201, { 'Idempotency-Key': randomUUID() });
    const firstPage = await api(buyer, '/tasks?limit=1');
    check(firstPage.tasks.length === 1 && firstPage.tasks[0].id === second.id && typeof firstPage.next_cursor === 'string', 'pagination-first-page');
    const nextPage = await api(buyer, '/tasks?limit=1&cursor=' + encodeURIComponent(firstPage.next_cursor));
    check(nextPage.tasks.length === 1 && nextPage.tasks[0].id === task.id, 'pagination-second-page');
    pass('cursor-pagination', { via: 'browser-cookie API', distinctPages: true });
    await api(buyer, '/tasks/' + second.id + '/cancel', 'POST', {});
    phase = 'worker-ui-acceptance';
    const worker = await actor('worker');
    async function detail(a) {
      await a.page.goto(APP + '/tasks/' + task.id);
      await a.page.getByRole('heading', { name: 'Terms fingerprint', exact: true }).waitFor();
    }
    await detail(worker);
    await worker.page.getByRole('button', { name: 'Accept agreement', exact: true }).click();
    await worker.page.getByRole('dialog').getByRole('button', { name: 'Confirm acceptance', exact: true }).click();
    await worker.page.getByRole('heading', { name: 'Voluntary unfunded work review', exact: true }).waitFor();
    check((await api(worker, '/tasks/' + task.id)).status === 'accepted_unfunded', 'acceptance-readback');
    pass('worker-accept-agreement', { via: 'UI confirmation + API readback' });
    const base = id => '/tasks/' + task.id + '/deliverables/' + id;
    const history = (a, id = 'copy') => api(a, base(id) + '/submissions');
    const section = (a, id) => a.page.getByRole('region', { name: id === 'copy' ? 'TEST copy revision' : 'TEST dispute flag', exact: true });
    async function action(a, id, button, confirm, artifact) {
      const area = section(a, id);
      if (artifact) await area.getByRole('textbox', { name: /artifact · raw JSON/i }).fill(JSON.stringify(artifact));
      await area.getByRole('button', { name: button, exact: true }).click();
      const dialog = a.page.getByRole('dialog');
      await dialog.getByText('I understand this is voluntary unfunded review: no deposit, no obligation to start work, and no financial deadlines.', { exact: true }).click();
      check(await dialog.getByRole('checkbox').isChecked(), 'review-acknowledgment-not-checked');
      const recorded = a.page.waitForRequest(r => r.method() === 'POST' && r.url().startsWith(APP + base(id) .replace('/tasks/', '/api/workspace/tasks/')));
      await dialog.getByRole('button', { name: confirm, exact: true }).click();
      const sent = await recorded;
      await area.getByText('Intent confirmed; current server history loaded.', { exact: true }).waitFor();
      check(await area.getByRole('alert').count() === 0, 'delivery-ui-alert');
      return JSON.parse(sent.postData());
    }
    phase = 'worker-ui-first-submission';
    const firstIntent = await action(worker, 'copy', 'Review submission', 'Confirm submit voluntary work', { greeting: '', action: 'Lanjutkan' });
    const v1 = await history(worker);
    check(v1.state === 'submitted' && v1.latest_version === 1 && v1.submissions[0].checker.output.passed === false, 'first-version-real-checker-failure');
    await shot(worker, 'worker-version-1');
    pass('voluntary-submission-v1', { via: 'UI + API readback', checkerPassed: false });
    phase = 'buyer-ui-revision';
    await detail(buyer);
    await action(buyer, 'copy', 'Request revision…', 'Confirm request revision');
    check((await history(buyer)).state === 'revision_requested', 'revision-not-recorded');
    pass('buyer-request-revision', { via: 'UI + API readback' });
    phase = 'worker-ui-second-submission';
    await detail(worker);
    await action(worker, 'copy', 'Review revision submission', 'Confirm submit voluntary work', { greeting: 'Halo', action: 'Lanjutkan' });
    const v2 = await history(worker);
    check(v2.latest_version === 2 && v2.submissions.length === 2 && v2.submissions[1].checker.output.passed === true, 'second-version-real-checker-pass');
    pass('voluntary-submission-v2', { via: 'UI + API readback', checkerPassed: true });
    phase = 'buyer-ui-accept-version';
    await detail(buyer);
    await action(buyer, 'copy', 'Accept latest version…', 'Confirm accept this version');
    const accepted = await history(buyer);
    check(accepted.state === 'accepted' && accepted.reviews.length === 2 && accepted.task_status === 'accepted_unfunded', 'buyer-accept-version-readback');
    pass('buyer-accept-version', { via: 'UI + API readback' });
    const replay = await api(worker, base('copy') + '/submissions', 'POST', firstIntent, 201);
    check(JSON.stringify(replay) === JSON.stringify(v1), 'historical-delivery-replay-differs');
    const currentAfterReplay = await history(worker);
    check(currentAfterReplay.state === 'accepted' && currentAfterReplay.submissions.length === 2, 'replay-added-event-or-regressed-state');
    await api(worker, base('copy') + '/submissions', 'POST', { ...firstIntent, notes: 'changed intent' }, 409);
    const createReplay = await api(buyer, '/tasks', 'POST', payload, 201, { 'Idempotency-Key': key });
    check(createReplay.id === task.id && createReplay.status === 'invited' && (await api(buyer, '/tasks/' + task.id)).status === 'accepted_unfunded', 'historical-create-replay-regression');
    pass('historical-idempotency-replay-with-fresh-readback', { via: 'browser-cookie API; exact UI submission intent', duplicateEvents: false });
    phase = 'ui-dispute';
    await action(worker, 'dispute', 'Review submission', 'Confirm submit voluntary work', { greeting: 'Halo', action: 'Lanjutkan' });
    await detail(buyer);
    await action(buyer, 'dispute', 'Flag dispute…', 'Confirm flag dispute');
    const disputed = await history(buyer, 'dispute');
    check(disputed.state === 'disputed' && disputed.disputes.length === 1 && disputed.disputes[0].evidence_flag === true, 'dispute-readback');
    pass('dispute-flag', { via: 'UI + API readback', meaning: 'participant allegation only; no arbitration or funds' });
    // Save only real, authenticated delivery snapshots; never auth response/cookies.
    await writeFile(join(runDir, 'checker-and-history.json'), JSON.stringify({ accepted, disputed }, null, 2) + '\n', { mode: 0o600 });
    for (const snapshot of [accepted, disputed]) {
      check(snapshot.task_status === 'accepted_unfunded', 'delivery-mutated-task-status');
      for (const submission of snapshot.submissions) check(submission.checker.http_status === 200 && submission.checker.policy === 'default_metadata_only'
        && submission.checker.output.ai_review.status === 'not_configured', 'checker-evidence-policy');
    }
    const frozen = { idempotency_key: randomUUID(), unfunded_review: true, manifest_hash: task.manifest_hash,
      expected_version: disputed.latest_version, artifact_hash: disputed.latest_artifact_hash, decision: 'accept' };
    await api(buyer, base('dispute') + '/reviews', 'POST', frozen, 409);
    const acceptedDispute = { ...frozen, idempotency_key: randomUUID(), expected_version: accepted.latest_version, artifact_hash: accepted.latest_artifact_hash };
    delete acceptedDispute.decision;
    await api(buyer, base('copy') + '/disputes', 'POST', acceptedDispute, 409);
    pass('terminal-review-boundaries', { via: 'browser-cookie API' });
    phase = 'mobile-and-desktop-evidence';
    for (const a of [buyer, worker]) {
      await detail(a);
      await section(a, 'copy').getByText('Accepted by buyer', { exact: true }).waitFor();
      await section(a, 'dispute').getByText('Disputed · review frozen', { exact: true }).waitFor();
      await a.page.getByText('Actual checker evidence · metadata checks passed', { exact: true }).first().click();
      await shot(a, a.role + '-final-desktop');
      await a.page.setViewportSize({ width: 390, height: 844 });
      const dimensions = await a.page.evaluate(() => ({ viewport: innerWidth, document: document.documentElement.scrollWidth, body: document.body.scrollWidth }));
      await shot(a, a.role + '-final-mobile');
      check(dimensions.document <= dimensions.viewport && dimensions.body <= dimensions.viewport, a.role + '-mobile-overflow');
      check((await a.page.locator('main [role="alert"], header [role="alert"]').allTextContents()).every(text => !text.trim()), a.role + '-final-ui-alert');
      pass(a.role + '-mobile-no-horizontal-overflow', dimensions);
    }
    phase = 'outsider-boundaries';
    const outsider = await actor('outsider');
    await api(outsider, '/tasks/' + task.id, 'GET', undefined, 404);
    await api(outsider, base('copy') + '/submissions', 'GET', undefined, 404);
    await api(outsider, base('dispute') + '/disputes', 'POST', acceptedDispute, 404);
    const outsiderPage = await api(outsider, '/tasks?limit=1&cursor=' + encodeURIComponent(firstPage.next_cursor));
    check(outsiderPage.tasks.length === 0 && outsiderPage.next_cursor === null, 'outsider-pagination-leak');
    await outsider.page.goto(APP + '/tasks/' + task.id);
    await outsider.page.getByRole('alert').first().waitFor();
    check(!(await outsider.page.locator('body').innerText()).includes(title), 'outsider-ui-leak');
    await shot(outsider, 'outsider-denied');
    pass('outsider-denied', { via: 'UI + browser-cookie API including cursor reuse' });
    phase = 'account-network-session-isolation';
    await api(buyer, '/tasks/' + task.id, 'GET', undefined, 401, { 'X-Pactra-Address': accounts.outsider.address });
    await api(buyer, '/tasks/' + task.id, 'GET', undefined, 401, { 'X-Pactra-Chain': String(chainID + 1) });
    buyer.selectedRole = 'outsider';
    await buyer.page.evaluate(address => window.__pactraTestWallet.account(address), accounts.outsider.address);
    await buyer.page.getByRole('button', { name: 'Sign in', exact: true }).first().waitFor();
    check(!(await buyer.page.locator('body').innerText()).includes(title), 'account-switch-stale-private-ui');
    await api(buyer, '/tasks/' + task.id, 'GET', undefined, 401);
    await shot(buyer, 'account-switched-no-stale-access');
    await worker.page.evaluate(chain => window.__pactraTestWallet.chain(chain), chainID + 1);
    await worker.page.getByRole('button', { name: 'Switch network', exact: true }).first().waitFor();
    check(!(await worker.page.locator('body').innerText()).includes(title), 'network-switch-stale-private-ui');
    await api(worker, '/tasks/' + task.id, 'GET', undefined, 401);
    await shot(worker, 'wrong-network-no-stale-access');
    pass('wallet-account-and-chain-events-clear-session', { via: 'EIP-1193 events + UI + API old-identity denial' });
    await api(outsider, '/auth/logout', 'POST', {}, 204);
    await api(outsider, '/tasks', 'GET', undefined, 401);
    pass('revoked-session-denied', { via: 'browser-cookie API' });
    phase = 'final-db-invariant';
    const stored = await sql(`SELECT status || ':' || manifest_hash FROM pactra.tasks WHERE id='${task.id}'::uuid`);
    check(stored === 'accepted_unfunded:' + task.manifest_hash, 'isolated-db-status-or-manifest-changed');
    pass('isolated-db-final-status', { status: 'accepted_unfunded', manifestUnchanged: true });
    check(report.errors.length === 0, 'unexpected-browser-errors');
    pass('no-unexpected-browser-errors');
    report.status = 'passed';
  } catch (error) {
    report.status = 'failed';
    if (browser) for (const [index, context] of browser.contexts().entries()) for (const page of context.pages()) {
      await page.screenshot({ path: join(runDir, 'failure-' + index + '.png'), fullPage: true }).catch(() => {});
      await writeFile(join(runDir, 'failure-' + index + '-ui.json'), JSON.stringify(await page.locator('button').evaluateAll(nodes => nodes.map(n => ({ text: n.textContent, disabled: n.disabled, rect: { width: n.getBoundingClientRect().width, height: n.getBoundingClientRect().height }, pointerEvents: getComputedStyle(n).pointerEvents }))), null, 2), { mode: 0o600 }).catch(() => {});
    }
    report.failure = { phase, code: error instanceof Failure ? error.code : error?.name === 'TimeoutError' ? 'ui-timeout' : 'unclassified-error' };
    throw new Failure(report.failure.code);
  } finally {
    report.finishedAt = new Date().toISOString();
    await save();
    await browser?.close();
    console.log('Artifact directory: ' + runDir);
  }
}
main().catch(error => {
  // Never print arbitrary exception messages, response bodies, stack traces or tokens.
  console.error('WORKSPACE E2E FAIL: ' + (error instanceof Failure ? error.code : 'unclassified-error'));
  process.exitCode = 1;
});

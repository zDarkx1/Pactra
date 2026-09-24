import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, mkdtemp, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';

// Opt-in real Chromium QA against the parent's shared dev server only.
const enabled = process.env.PACTRA_BROWSER_QA === '1';
const origin = 'http://localhost:4099';
const output = '/root/.hermes/output/pactra-polish/dashboard';
const require = createRequire(import.meta.url);

test('Radix workspace: live responsive shell and isolated consent/identity DOM contracts', { skip: !enabled, timeout: 180000 }, async () => {
  const playwrightPath = '/root/ui-research/node_modules/playwright/index.mjs';
  const { chromium } = await import(playwrightPath);
  await mkdir(output, { recursive: true });
  const browser = await chromium.launch({ executablePath: '/root/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome', headless: true, args: ['--no-sandbox'] });
  const evidence: any[] = [];
  try {
    for (const width of [390, 768, 1440]) {
      const page = await browser.newPage({ viewport: { width, height: 1000 } });
      const errors: string[] = [];
      page.on('pageerror', (error: Error) => errors.push(error.message));
      await page.goto(origin + '/dashboard');
      await page.getByRole('heading', { name: 'Agreements', exact: true }).waitFor();
      assert.equal(new URL(page.url()).pathname, '/tasks');
      await page.getByRole('button', { name: 'Connect wallet', exact: true }).first().waitFor();
      const geometry = await page.evaluate(() => {
        const controls = [...document.querySelectorAll('header button, header a')].map(element => ({ label: element.getAttribute('aria-label') || element.textContent, rect: element.getBoundingClientRect().toJSON() })).filter(item => item.rect.width);
        return { width: document.documentElement.scrollWidth, controls };
      });
      assert.equal(geometry.width, width);
      for (const { rect } of geometry.controls) { assert.ok(rect.width >= 44 && rect.height >= 44); assert.ok(rect.x >= 0 && rect.right <= width); }
      await page.screenshot({ path: `${output}/final-${width}.png`, fullPage: true });
      if (width === 390) {
        const trigger = page.getByRole('button', { name: 'Open navigation' });
        await trigger.focus(); await page.keyboard.press('Enter');
        const dialog = page.getByRole('dialog', { name: 'Workspace', exact: true });
        await dialog.waitFor();
        assert.equal(await dialog.getAttribute('data-motion'), 'instant');
        assert.equal(await page.locator('button[aria-label="Open navigation"]').getAttribute('aria-expanded'), 'true');
        for (let i = 0; i < 8; i++) {
          await page.keyboard.press('Tab');
          assert.ok(await dialog.evaluate((element: HTMLElement) => element.contains(document.activeElement)));
        }
        assert.ok(await page.evaluate(() => document.body.hasAttribute('data-scroll-locked')));
        await page.screenshot({ path: `${output}/drawer-390.png` });
        await page.keyboard.press('Escape'); await dialog.waitFor({ state: 'hidden' });
        await page.waitForFunction(() => document.activeElement?.getAttribute('aria-label') === 'Open navigation');
        await trigger.click(); await dialog.waitFor();
        await page.mouse.click(375, 400); await dialog.waitFor({ state: 'hidden' });
        await trigger.click(); await dialog.waitFor();
        await dialog.getByRole('link', { name: 'JSON checker' }).click();
        await page.waitForURL(origin + '/checker');
        await page.waitForFunction(() => document.activeElement?.id === 'main-content');
        await page.goto(origin + '/tasks');
        await page.emulateMedia({ reducedMotion: 'reduce' });
        await trigger.click(); await dialog.waitFor();
        assert.equal(await dialog.getAttribute('data-motion'), 'instant');
        await page.setViewportSize({ width: 768, height: 1000 });
        await dialog.waitFor({ state: 'hidden' });
        assert.ok(!await page.evaluate(() => document.body.hasAttribute('data-scroll-locked')));
      } else {
        await page.getByRole('button', { name: 'Collapse sidebar' }).click();
        const link = page.getByRole('navigation', { name: 'Workspace', exact: true }).getByRole('link', { name: 'JSON checker', exact: true });
        assert.equal(await link.getAttribute('href'), '/checker');
        await link.focus(); await page.getByRole('tooltip', { name: 'JSON checker' }).waitFor();
        await page.screenshot({ path: `${output}/collapsed-${width}.png`, fullPage: true });
        await page.keyboard.press('Escape');
        await page.getByRole('tooltip').waitFor({ state: 'hidden' });
        await page.reload();
        await page.getByRole('button', { name: 'Expand sidebar' }).waitFor();
      }
      assert.deepEqual(errors, []);
      evidence.push({ width, geometry, errors, liveShell: 'passed' });
      await page.close();
    }

    // Bundle actual owned components in a temporary test artifact, not .next.
    // Fake provider + RainbowKit state is explicit, isolated, and never used in the app.
    const temp = await mkdtemp(resolve(tmpdir(), 'pactra-radix-'));
    await writeFile(resolve(temp, 'package.json'), JSON.stringify({ type: 'module' }));
    const root = resolve(import.meta.dirname, '..');
    const modules = require.resolve('react').split('/react/')[0];
    const provider = resolve(temp, 'provider.js');
    const wallet = resolve(temp, 'wallet.js');
    const next = resolve(temp, 'next.js');
    const loader = resolve(temp, 'loader.cjs');
    await writeFile(provider, `import React from 'react'; export const Context=React.createContext(null); export function useWorkspace(){return React.useContext(Context);}`);
    await writeFile(wallet, `import React from 'react'; export const ConnectButton={Custom:({children})=>children({mounted:true,account:{address:'0x1111111111111111111111111111111111111111',displayName:'very-long-test-wallet-name.eth'},chain:{id:31337},openAccountModal(){},openConnectModal(){},openChainModal(){}})};`);
    await writeFile(next, `import React from 'react'; export default function Link({children,prefetch,...props}){return React.createElement('a',props,children)}; export function useRouter(){return {replace(){throw Error('No test network mutations')}}}`);
    await writeFile(loader, `const ts=require(${JSON.stringify(require.resolve('typescript'))});module.exports=function(source){return ts.transpileModule(source,{compilerOptions:{jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText}`);
    const entry = resolve(temp, 'entry.jsx');
    await writeFile(entry, `
import React,{useState} from 'react'; import {createRoot} from 'react-dom/client';
import {Context} from './provider';
import {WorkspaceConfirmation} from ${JSON.stringify(resolve(root, 'components/tasks/task-shared'))};
import Form from ${JSON.stringify(resolve(root, 'components/tasks/task-form'))};
import {WalletControl} from ${JSON.stringify(resolve(root, 'components/wallet-control'))};
import {shellStyles} from ${JSON.stringify(resolve(root, 'components/shell-styles'))};
function Test(){const [open,setOpen]=useState(false);const [identity,setIdentity]=useState(1);const [calls,setCalls]=useState(0);const [signing,setSigning]=useState(false);
window.invalidate=()=>setIdentity(2); window.signing=()=>setSigning(true);
return <Context.Provider value={{status:'signedIn',address:'0x1111111111111111111111111111111111111111',sessionKey:identity,signing,signIn(){},signOut(){},config:{enabled:true,chain:{id:31337},arbiters:[]}}}>
<header className={shellStyles.topbar}><a className={shellStyles.wordmark} href="/">Pactra</a><div className={shellStyles.headerActions}><WalletControl/><button className={shellStyles.iconButton} aria-label="Test navigation">☰</button></div></header>
<main id="main-content" tabIndex={-1}><button onClick={()=>setOpen(true)}>Open test confirmation</button><output aria-label="Confirmation calls">{calls}</output><Form/></main>
{open&&<WorkspaceConfirmation title="Test confirmation" description="Synthetic consent test; no request is sent." acknowledgement="I acknowledge this test intent" confirmLabel="Confirm test intent" onDismiss={()=>setOpen(false)} onConfirm={ack=>{if(ack)setCalls(c=>c+1);setOpen(false)}}><p>Exact test terms</p></WorkspaceConfirmation>}
</Context.Provider>}; createRoot(document.getElementById('test-root')).render(<Test/>);`);
    const { webpack } = require('next/dist/compiled/webpack/webpack');
    await new Promise<void>((done, reject) => {
      webpack({ mode: 'development', devtool: false, entry, output: { path: temp, filename: 'bundle.js' }, resolve: { extensions: ['.js', '.jsx', '.ts', '.tsx'], modules: [modules], alias: { [resolve(root, 'components/workspace-provider')]: provider, '@rainbow-me/rainbowkit': wallet, 'next/link': next, 'next/navigation': next } }, module: { rules: [{ test: /\.[jt]sx?$/, resolve: { fullySpecified: false }, exclude: /node_modules/, use: loader }] } }, (error: Error, stats: any) => error || stats.hasErrors() ? reject(error || new Error(stats.toString({ all: false, errors: true }))) : done());
    });
    const page = await browser.newPage({ viewport: { width: 390, height: 1000 } });
    await page.goto(origin + '/tasks');
    const css = await page.locator('link[rel="stylesheet"]').evaluateAll((links: Element[]) => links.map(link => link.getAttribute('href')));
    await page.route(origin + '/__radix-test', (route: any) => route.fulfill({ contentType: 'text/html', body: `<!doctype html><html><head>${css.map((href: string) => `<link rel="stylesheet" href="${href}">`).join('')}</head><body><div id="test-root"></div><script src="/__radix-test.js"></script></body></html>` }));
    await page.route(origin + '/__radix-test.js', async (route: any) => route.fulfill({ contentType: 'text/javascript', body: await readFile(resolve(temp, 'bundle.js'), 'utf8') }));
    page.on('pageerror', (error: Error) => console.error('Test harness page error:', error.message));
    page.on('console', (message: any) => { if (message.type() === 'error') console.error('Test harness console:', message.text()); });
    await page.goto(origin + '/__radix-test');
    await page.getByRole('heading', { name: 'Agreement creation awaiting arbiter setup' }).waitFor();
    assert.ok(await page.getByRole('button', { name: 'Review agreement' }).isDisabled());
    assert.equal(await page.getByRole('alert').count(), 0);
    for (const width of [390, 768, 1440]) {
      await page.setViewportSize({ width, height: 1000 });
      const controls = await page.locator('header a,header button').evaluateAll((elements: Element[]) => elements.map(e => e.getBoundingClientRect().toJSON()));
      for (const rect of controls) { assert.ok(rect.height >= 44); assert.ok(rect.x >= 0 && rect.right <= width); }
      for (let i=0;i<controls.length;i++) for(let j=i+1;j<controls.length;j++) {
        const a=controls[i],b=controls[j]; assert.ok(a.right<=b.left||b.right<=a.left||a.bottom<=b.top||b.bottom<=a.top, 'wallet controls must not collide');
      }
      await page.screenshot({ path: `${output}/test-provider-blocked-${width}.png`, fullPage: true });
    }
    await page.setViewportSize({ width: 390, height: 1000 });
    const opener = page.getByRole('button', { name: 'Open test confirmation' });
    await opener.click();
    const dialog = page.getByRole('dialog', { name: 'Test confirmation' });
    await dialog.waitFor();
    await page.waitForFunction(() => document.activeElement?.textContent === 'Go back');
    assert.ok(await page.getByRole('button', { name: 'Confirm test intent' }).isDisabled());
    await page.screenshot({ path: `${output}/test-provider-confirmation-390.png` });
    const box = await dialog.boundingBox(); assert.ok(box && box.x >= 0 && box.x + box.width <= 390);
    await page.keyboard.press('Escape'); await dialog.waitFor({ state: 'hidden' });
    await page.waitForFunction(() => document.activeElement?.textContent === 'Open test confirmation');
    await opener.click(); await page.getByRole('checkbox').check();
    await page.getByRole('button', { name: 'Confirm test intent' }).dblclick();
    assert.equal(await page.getByLabel('Confirmation calls').textContent(), '1');
    await opener.click(); assert.ok(!await page.getByRole('checkbox').isChecked());
    await page.getByRole('checkbox').check();
    await page.evaluate(() => (window as any).invalidate());
    await dialog.waitFor({ state: 'hidden' });
    assert.equal(await page.getByLabel('Confirmation calls').textContent(), '1');
    evidence.push({ isolatedProvider: true, consent: 'disabled until acknowledged; once only; reset on reopen', identity: 'closed without sending', arbiterGate: 'disabled', walletGeometry: 'no collision at 390/768/1440' });
    await page.close();
    await writeFile(`${output}/qa.json`, JSON.stringify(evidence, null, 2));
  } finally { await browser.close(); }
});

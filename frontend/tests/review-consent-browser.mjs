// APP-03: real TaskOnchain/confirmation/service DOM; mocked wallet/RPC/BFF only.
// Contract mining is separately exercised by ReviewConsent.t.sol. No live network.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtemp, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
const require = createRequire(import.meta.url);
const { chromium } = await import('/root/ui-research/node_modules/playwright/index.mjs');
const root = resolve(import.meta.dirname, '..');
const temp = await mkdtemp(resolve(tmpdir(), 'pactra-review-consent-'));
await writeFile(resolve(temp, 'package.json'), JSON.stringify({ type: 'module' }));
const modules = require.resolve('react').split('/react/')[0];
const provider = resolve(temp, 'provider.js'), wallet = resolve(temp, 'wallet.js'), next = resolve(temp, 'next.js'), wagmi = resolve(temp, 'wagmi.js'), loader = resolve(temp, 'loader.cjs'), entry = resolve(temp, 'entry.jsx');
await writeFile(provider, `import React from 'react';export const Context=React.createContext(null);export function useWorkspace(){return React.useContext(Context)}`);
await writeFile(wallet, `import React from 'react';export function WalletControl(){return <button>Fixture wallet</button>}`);
await writeFile(next, `import React from 'react';export default function Link({children,prefetch,...props}){return <a {...props}>{children}</a>}`);
await writeFile(wagmi, `export function useConfig(){return {}};export function usePublicClient(){return window.client};export function getAccount(){return {address:window.buyer,chainId:31337}};export function useSendTransaction(){return {sendTransactionAsync:async call=>{window.sent.push(call);throw {code:4001}}}};export function useSignTypedData(){return {signTypedDataAsync:async()=>{throw Error('unexpected bilateral call')}}}`);
await writeFile(loader, `const ts=require(${JSON.stringify(require.resolve('typescript'))});module.exports=function(source){return ts.transpileModule(source,{compilerOptions:{jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText}`);
const buyer = '0x1111111111111111111111111111111111111111', worker = '0x2222222222222222222222222222222222222222', escrow = '0x5555555555555555555555555555555555555555';
const digest = '0x' + 'd'.repeat(64), hashA = '0x' + 'a'.repeat(64), hashB = '0x' + 'b'.repeat(64);
const config = { enabled: true, chain_id: '31337', escrow_address: escrow, confirmations: 2, attestation_available: false };
const task = { id: '11111111-1111-4111-8111-111111111111', status: 'accepted_unfunded', manifest_hash: 'a'.repeat(64), manifest: { buyer, worker, primary_arbiter: '0x3333333333333333333333333333333333333333', backup_arbiter: '0x4444444444444444444444444444444444444444', chain_id: 31337, version: 1, delivery_deadline: '2027-01-01T00:00:00Z', total_base_units: '100', deliverables: [{ id: 'copy', title: 'Fixture artifact', amount_base_units: '100', revision_limit: 2, review_period_hours: 24 }] } };
const binding = { task_id: task.id, chain_id: '31337', escrow_address: escrow, onchain_task_id: '7', manifest_digest: digest, transaction_hash: '0x' + 'e'.repeat(64), block_number: '10', block_hash: '0x' + 'c'.repeat(64) };
await writeFile(entry, `import React from 'react';import{createRoot}from'react-dom/client';import{Context}from'./provider';import{TaskOnchain}from ${JSON.stringify(resolve(root,'components/onchain/task-actions'))};import{setWorkspaceIdentity}from ${JSON.stringify(resolve(root,'lib/workspace-client'))};import{decodeFunctionData}from'viem';import{escrowAbi}from ${JSON.stringify(resolve(root,'lib/escrow-abi'))};
const task=${JSON.stringify(task)},digest=${JSON.stringify(digest)};window.buyer=task.manifest.buyer;window.round=1;window.sent=[];window.simulations=0;window.decode=()=>decodeFunctionData({abi:escrowAbi,data:window.sent[0].data});
window.client={getChainId:async()=>31337,getCode:async()=>'0x1234',getBlockNumber:async()=>13n,getBlock:async({blockNumber})=>({number:blockNumber,timestamp:1100n,hash:'0x'+'c'.repeat(64)}),readContract:async p=>{switch(p.functionName){case'getTask':return[task.manifest.buyer,task.manifest.worker,task.manifest.primary_arbiter,task.manifest.backup_arbiter,digest,31337n,2,1n,0n];case'getTaskManifest':return[1n,'0x'+task.manifest_hash];case'manifestDigest':return digest;case'balances':return 0n;case'getDeliverable':return[100n,2,86400n,1,window.round-1,window.round===1?1000n:1001n,0n,0n,0n,0n];case'getDeliveryEvidence':return[BigInt(Date.parse(task.manifest.delivery_deadline)/1000),true,window.round===1?'0x'+'a'.repeat(64):'0x'+'b'.repeat(64),2000n];default:throw Error('unexpected read '+p.functionName)}},call:async()=>{window.simulations++;return {}}};
setWorkspaceIdentity({address:window.buyer,chainId:31337});createRoot(document.getElementById('root')).render(<Context.Provider value={{status:'signedIn',address:window.buyer,sessionKey:'fixture',config:{enabled:true,chain:{id:31337,nativeCurrency:{decimals:18,symbol:'ETH'}}}}}><main id="main-content"><TaskOnchain task={task}/></main></Context.Provider>);`);
const { webpack } = require('next/dist/compiled/webpack/webpack');
await new Promise((done, reject) => webpack({ mode:'development',devtool:false,entry,output:{path:temp,filename:'bundle.js'},resolve:{extensions:['.js','.jsx','.ts','.tsx'],modules:[modules],alias:{[resolve(root,'components/workspace-provider')]:provider,[resolve(root,'components/wallet-control')]:wallet,'next/link':next,'wagmi$':wagmi,'wagmi/actions$':wagmi}},module:{rules:[{test:/\.[jt]sx?$/,resolve:{fullySpecified:false},exclude:/node_modules/,use:loader}]}},(error,stats)=>error||stats.hasErrors()?reject(error||Error(stats.toString({all:false,errors:true}))):done()));
const browser = await chromium.launch({executablePath:'/root/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome',headless:true,args:['--no-sandbox']});
try {
  const page = await browser.newPage({ viewport: { width: 900, height: 1000 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.origin !== 'http://pactra.test') throw Error('Unexpected external request: ' + url.origin);
    if (url.pathname === '/bundle.js') return route.fulfill({ contentType:'text/javascript', body: await readFile(resolve(temp,'bundle.js'),'utf8') });
    if (url.pathname.startsWith('/api/workspace')) return route.fulfill({ json: url.pathname.endsWith('/onchain/config') ? config : binding });
    return route.fulfill({ contentType:'text/html', body:'<!doctype html><div id="root"></div><script src="/bundle.js"></script>' });
  });
  const actions = [['Accept and allocate payment','acceptDeliverable'],['Request revision onchain','requestRevision'],['Open onchain dispute','openDispute']];
  for (const [label, action] of actions) {
    await page.goto('http://pactra.test/');
    const button = page.getByRole('button',{ name:label,exact:true });
    try { await button.click({timeout:10000}); }
    catch (error) { console.error('DOM:', await page.locator('body').innerText(), 'errors:', errors); throw error; }
    let dialog = page.getByRole('dialog');
    await dialog.waitFor();
    assert.ok((await dialog.innerText()).includes('Review round: 1'));
    assert.ok((await dialog.innerText()).includes(hashA));
    assert.ok((await dialog.innerText()).includes('submittedAt: 1000'));
    assert.ok(await dialog.getByRole('button',{name:'Continue to wallet'}).isDisabled());
    await page.evaluate(() => { window.round = 2; });
    // Open confirmation retains A, even though the RPC now returns B.
    assert.ok((await dialog.innerText()).includes(hashA));
    assert.ok(!(await dialog.innerText()).includes(hashB));
    await dialog.getByRole('checkbox').check();
    await dialog.getByRole('button',{name:'Continue to wallet'}).click();
    await page.getByRole('alert').filter({hasText:'Review consent could not be revalidated'}).waitFor();
    assert.equal(await page.evaluate(() => window.sent.length),0);
    assert.equal(await page.evaluate(() => window.simulations),0);
    await page.getByRole('button',{name:'Read chain state',exact:true}).click();
    await page.getByText('Review round 2', {exact:false}).waitFor();
    try { await button.click({timeout:10000}); }
    catch (error) { console.error('DOM:', await page.locator('body').innerText(), 'errors:', errors); throw error; }
    dialog = page.getByRole('dialog');
    assert.ok((await dialog.innerText()).includes('Review round: 2'));
    assert.ok((await dialog.innerText()).includes(hashB));
    assert.ok((await dialog.innerText()).includes('submittedAt: 1001'));
    assert.ok(await dialog.getByRole('button',{name:'Continue to wallet'}).isDisabled());
    await dialog.getByRole('checkbox').check();
    await dialog.getByRole('button',{name:'Continue to wallet'}).click();
    await page.getByText('Wallet request rejected.',{exact:false}).waitFor();
    const decoded = await page.evaluate(() => { const d = window.decode(); return {functionName:d.functionName,args:d.args.map(x=>String(x))}; });
    assert.deepEqual(decoded,{functionName:action,args:['7','0','2',hashB,'1001']});
    assert.equal(await page.evaluate(() => window.sent.length),1);
  }
  assert.deepEqual(errors,[]);
  console.log(JSON.stringify({result:'passed',actions:actions.map(a=>a[1]),checks:['actual confirmation freezes/displays round/hash/submittedAt','held confirmation blocks changed evidence without wallet/simulation','refresh requires new acknowledgement','renewed consent produces exact guarded calldata'],scope:'real TaskOnchain/service DOM; mocked BFF/RPC/wallet; no live network or mining',artifact:temp}));
} finally { await browser.close(); }

// Real React/Radix components + real local viem signatures in Chromium.
// RPC/backend/wallet transport are explicit fixtures. No EVM, funded tx or real receipt.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtemp, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { workerAccount } from './onchain-agreement-fixture.ts';
import { agreementTypedData } from '../lib/onchain-agreement.ts';
const require = createRequire(import.meta.url);
const { chromium } = await import('/root/ui-research/node_modules/playwright/index.mjs');
const root = resolve(import.meta.dirname, '..');
const temp = await mkdtemp(resolve(tmpdir(), 'pactra-bilateral-browser-'));
await writeFile(resolve(temp, 'package.json'), JSON.stringify({ type: 'module' }));
const modules = require.resolve('react').split('/react/')[0];
const provider = resolve(temp, 'provider.js'), wallet = resolve(temp, 'wallet.jsx'), next = resolve(temp, 'next.jsx'), loader = resolve(temp, 'loader.cjs'), entry = resolve(temp, 'entry.jsx'), wagmi = resolve(temp, 'wagmi.js');
await writeFile(provider, `import React from 'react';export const Context=React.createContext(null);export function useWorkspace(){return React.useContext(Context)}`);
await writeFile(wallet, `import React from 'react';export function WalletControl(){return <button>Fixture wallet</button>}`);
await writeFile(next, `import React from 'react';export default function Link({children,prefetch,...props}){return <a {...props}>{children}</a>}`);
await writeFile(wagmi, `export function useConfig(){return {}};export function getAccount(){return window.walletAccount};export function usePublicClient(){return window.rpc.client};export function useSendTransaction(){return {sendTransactionAsync:async call=>{window.sends.push(call);if(window.successRelay){window.rpc.state.status=3;window.rpc.state.nonce=0n;return '0x'+'9'.repeat(64)}throw Object.assign(Error('Fixture wallet rejection'),{code:4001})}}};export function useSignTypedData(){return {signTypedDataAsync:async data=>{window.signs.push(data);if(window.rejectSign)throw Error('Fixture wallet signature rejected');if(window.delaySign)await new Promise(resolve=>window.finishSign=resolve);return window.signer.signTypedData(data)}}}`);
await writeFile(loader, `const ts=require(${JSON.stringify(require.resolve('typescript'))});module.exports=function(source){return ts.transpileModule(source,{compilerOptions:{jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText}`);
await writeFile(entry, `import React,{useState}from'react';import{createRoot}from'react-dom/client';import{Context}from'./provider';import{TaskOnchain}from ${JSON.stringify(resolve(root,'components/onchain/task-actions'))};import{setWorkspaceIdentity}from ${JSON.stringify(resolve(root,'lib/workspace-client'))};import{rpcFixture,buyerAccount,task,config,binding}from ${JSON.stringify(resolve(root,'tests/onchain-agreement-fixture'))};
window.rpc=rpcFixture();window.signer=buyerAccount;window.walletAccount={address:buyerAccount.address,chainId:31337};window.signs=[];window.sends=[];window.requests=[];window.copied='';Object.defineProperty(navigator,'clipboard',{value:{writeText:async text=>{window.copied=text}}});window.fetch=async(url,init)=>{window.requests.push({url,method:init?.method||'GET',body:init?.body});return Response.json(url.endsWith('/onchain/config')?config:binding)};setWorkspaceIdentity({address:buyerAccount.address,chainId:31337});
function Test(){const[key,K]=useState(0);const[status,S]=useState('signedIn');window.signOut=()=>{setWorkspaceIdentity(null);S('signedOut');K(n=>n+1)};window.reset=()=>{window.rpc=rpcFixture();setWorkspaceIdentity({address:buyerAccount.address,chainId:31337});S('signedIn');K(n=>n+1)};return <Context.Provider value={{status,address:status==='signedIn'?buyerAccount.address:null,sessionKey:key,config:{enabled:true,chain:{id:31337,nativeCurrency:{name:'Fixture currency',symbol:'TEST',decimals:18}}}}}><main id="main-content">{status==='signedIn'?<TaskOnchain key={key} task={task}/>:<p>Signed out fixture</p>}</main></Context.Provider>};createRoot(document.getElementById('root')).render(<Test/>);`);
const { webpack } = require('next/dist/compiled/webpack/webpack');
await new Promise((done,reject)=>webpack({mode:'development',devtool:false,entry,output:{path:temp,filename:'bundle.js'},resolve:{extensions:['.js','.jsx','.ts','.tsx'],modules:[modules],alias:{[resolve(root,'components/workspace-provider')]:provider,[resolve(root,'components/wallet-control')]:wallet,'next/link':next,'wagmi$':wagmi,'wagmi/actions$':wagmi}},module:{rules:[{test:/\.[jt]sx?$/,resolve:{fullySpecified:false},exclude:/node_modules/,use:loader}]}},(error,stats)=>error||stats.hasErrors()?reject(error||Error(stats.toString({all:false,errors:true}))):done()));
const browser = await chromium.launch({executablePath:'/root/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome',headless:true,args:['--no-sandbox']});
try {
  const page = await browser.newPage({viewport:{width:1000,height:900}});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('http://pactra.test/**',async route=>route.fulfill({contentType:route.request().url().endsWith('/bundle.js')?'text/javascript':'text/html',body:route.request().url().endsWith('/bundle.js')?await readFile(resolve(temp,'bundle.js'),'utf8'):'<!doctype html><div id="root"></div><script src="/bundle.js"></script>'}));
  await page.goto('http://pactra.test/');
  const region=page.getByRole('region',{name:'Bilateral settlement'});
  await region.waitFor();
  await page.evaluate(()=>{window.rpc.state.timestamp=window.rpc.state.handover+172800n});
  await page.getByRole('button',{name:'Read chain state',exact:true}).click();
  await region.waitFor({state:'hidden'});
  await page.evaluate(()=>{window.rpc.state.timestamp+=1n});
  await page.getByRole('button',{name:'Read chain state',exact:true}).click();
  await region.waitFor();
  async function prepare() {
    await page.getByLabel('Worker award in integer native base units').fill('60');
    await page.getByLabel('Expiry in Unix seconds (UTC, inclusive)').fill('500000');
    await page.getByRole('button',{name:'Prepare exact agreement',exact:true}).click();
    await page.getByRole('button',{name:'Review wallet signature',exact:true}).waitFor();
  }
  await prepare();
  const display=await page.getByLabel('Exact EIP-712 typed data').textContent();
  const typed=JSON.parse(display);
  assert.deepEqual(typed.message,{taskId:'7',index:'0',manifestHash:'0x'+'d'.repeat(64),workerAmount:'60',nonce:'0',expiry:'500000'});
  assert.equal(typed.domain.name,'PactraEscrow');assert.equal(typed.domain.version,'2');assert.equal(typed.domain.chainId,'31337');assert.equal(typed.domain.verifyingContract,'0x5555555555555555555555555555555555555555');
  await page.getByText('Buyer refund: 0.00000000000000004 TEST (40 native base units)',{exact:false}).waitFor();
  await page.getByText('Expiry: 500000 Unix seconds',{exact:false}).waitFor();
  assert.ok(await page.getByRole('button',{name:'Review bilateral relay',exact:true}).isDisabled());
  assert.deepEqual(await page.evaluate(()=>[window.signs.length,window.sends.length]),[0,0]);
  await page.getByRole('button',{name:'Review wallet signature',exact:true}).click();
  let dialog=page.getByRole('dialog',{name:'Sign bilateral settlement?'});await dialog.waitFor();
  assert.ok(await dialog.getByRole('button',{name:'Sign exact agreement in wallet'}).isDisabled());
  await dialog.getByRole('button',{name:'Go back'}).click();
  assert.equal(await page.evaluate(()=>window.signs.length),0);
  await page.getByRole('button',{name:'Review wallet signature',exact:true}).click();
  await dialog.getByRole('checkbox').check();
  await page.evaluate(()=>window.rpc.state.timestamp=500001n);
  await dialog.getByRole('button',{name:'Sign exact agreement in wallet'}).click();
  await page.getByRole('alert').filter({hasText:'Agreement expired'}).waitFor();
  assert.equal(await page.evaluate(()=>window.signs.length),0);
  await page.evaluate(()=>window.rpc.state.timestamp=400000n);
  await page.getByRole('button',{name:'Review wallet signature',exact:true}).click();
  await dialog.getByRole('checkbox').check();
  await dialog.getByRole('button',{name:'Sign exact agreement in wallet'}).click();
  await page.getByText('Buyer signature: verified for this agreement at last check.',{exact:false}).waitFor();
  assert.deepEqual(await page.evaluate(()=>[window.signs.length,window.sends.length]),[1,0]);
  assert.ok(await page.getByRole('button',{name:'Review bilateral relay',exact:true}).isDisabled());
  await page.getByRole('button',{name:'Copy agreement JSON',exact:true}).click();
  const exported=JSON.parse(await page.evaluate(()=>window.copied));
  assert.ok(exported.buyerSignature);assert.equal(exported.workerSignature,null);
  const combined={...exported,workerSignature:await workerAccount.signTypedData(agreementTypedData(exported))};
  async function paste(p) {
    await page.getByLabel('Paste agreement JSON with public signatures only').fill(JSON.stringify(p));
    await page.getByRole('button',{name:'Validate pasted agreement against chain'}).click();
  }
  await paste({...combined,domain:{...combined.domain,chainId:'1'}});
  await page.getByRole('alert').filter({hasText:'differs from current chain state'}).waitFor();
  assert.equal(await page.getByRole('button',{name:'Review bilateral relay',exact:true}).count(),0);
  await paste(combined);
  const relay=page.getByRole('button',{name:'Review bilateral relay',exact:true});await relay.waitFor();
  assert.ok(await relay.isEnabled());await relay.click();
  dialog=page.getByRole('dialog',{name:'Relay bilateral settlement?'});await dialog.waitFor();
  assert.ok(await dialog.getByRole('button',{name:'Continue to wallet'}).isDisabled());
  await dialog.getByText('Buyer refund: 0.00000000000000004 TEST (40 native base units)',{exact:false}).waitFor();
  await dialog.getByRole('button',{name:'Go back'}).click();assert.equal(await page.evaluate(()=>window.sends.length),0);
  // Consent stays frozen; nonce races must fail in preflight, without a wallet transaction.
  await relay.click();await dialog.getByRole('checkbox').check();
  await page.evaluate(()=>window.rpc.state.nonce=1n);
  await dialog.getByRole('button',{name:'Continue to wallet'}).click();
  await page.getByText('Preflight blocked this action.',{exact:false}).waitFor();assert.equal(await page.evaluate(()=>window.sends.length),0);
  await page.evaluate(()=>window.rpc.state.nonce=0n);
  await relay.click();await dialog.getByRole('checkbox').check();
  await dialog.getByRole('button',{name:'Continue to wallet'}).click();
  await page.getByText('Wallet request rejected.',{exact:false}).waitFor();assert.equal(await page.evaluate(()=>window.sends.length),1);
  // Explicit synthetic receipt/readback: success cannot be shown until nonce consumption is observed.
  await page.evaluate(()=>{
    window.successRelay=true;
    window.rpc.client.waitForTransactionReceipt=async({hash})=>({status:'success',transactionHash:hash});
    window.rpc.client.getTransaction=async()=>{const c=window.sends.at(-1);return {to:c.to,from:c.account,input:c.data,value:c.value}};
  });
  await relay.click();await dialog.getByRole('checkbox').check();await dialog.getByRole('button',{name:'Continue to wallet'}).click();
  await page.getByText('Outcome uncertain.',{exact:false}).waitFor();
  assert.equal(await page.getByText('Confirmed receipt and authoritative readback succeeded.',{exact:true}).count(),0);
  assert.equal(await page.evaluate(()=>window.sends.length),2);
  await page.evaluate(()=>window.rpc.state.nonce=1n);
  await page.getByRole('button',{name:'Check receipt without resending',exact:true}).click();
  await page.getByText('Confirmed receipt and authoritative readback succeeded.',{exact:true}).waitFor();
  await region.waitFor({state:'hidden'});
  assert.equal(await page.evaluate(()=>window.sends.length),2);
  await page.evaluate(()=>window.successRelay=false);
  // Wallet signature rejection is not a signature or relay success.
  await page.evaluate(()=>{window.reset();window.rejectSign=true});await region.waitFor();await prepare();
  await page.getByRole('button',{name:'Review wallet signature',exact:true}).click();
  dialog=page.getByRole('dialog',{name:'Sign bilateral settlement?'});await dialog.getByRole('checkbox').check();await dialog.getByRole('button',{name:'Sign exact agreement in wallet'}).click();
  await page.getByRole('alert').filter({hasText:'Fixture wallet signature rejected'}).waitFor();
  assert.ok(await relay.isDisabled());
  // A wallet chain switch after consent blocks signing even before a session rerender.
  await page.evaluate(()=>{window.rejectSign=false;window.walletAccount.chainId=1});
  const signCount=await page.evaluate(()=>window.signs.length);
  await page.getByRole('button',{name:'Review wallet signature',exact:true}).click();
  await dialog.getByRole('checkbox').check();await dialog.getByRole('button',{name:'Sign exact agreement in wallet'}).click();
  await page.getByRole('alert').filter({hasText:'Wallet or session changed'}).waitFor();
  assert.equal(await page.evaluate(()=>window.signs.length),signCount);
  await page.evaluate(()=>window.walletAccount.chainId=31337);
  // Disposing while an actual local signature is deferred cannot publish or relay it.
  await page.evaluate(()=>{window.rejectSign=false;window.delaySign=true});
  await page.getByRole('button',{name:'Review wallet signature',exact:true}).click();
  await dialog.getByRole('checkbox').check();await dialog.getByRole('button',{name:'Sign exact agreement in wallet'}).click();
  await page.waitForFunction(()=>typeof window.finishSign==='function');
  await page.evaluate(()=>{window.signOut();window.finishSign()});
  await page.getByText('Signed out fixture',{exact:true}).waitFor();
  assert.equal(await page.getByRole('dialog').count(),0);assert.equal(await region.count(),0);
  assert.equal(await page.evaluate(()=>window.sends.length),2);
  assert.ok((await page.evaluate(()=>window.requests)).every(p=>p.method==='GET'&&!p.body));
  assert.deepEqual(errors,[]);
  console.log(JSON.stringify({result:'passed',checks:['strict backup-window DOM gate','expiry race blocks signing','wallet chain switch blocks signing','exact EIP-712 domain/message/derived refund/units/expiry DOM','no signing without explicit Radix consent','actual local viem buyer signature and worker countersignature exchange','missing/foreign-domain signatures cannot relay','separate relay consent/cancel','nonce race blocks before send','wallet rejection is not success','logout during signing discards result','no backend signing or mutation request'],scope:'real components and crypto; fixture RPC/backend/wallet transport; no real-chain or receipt claim',artifact:temp}));
} finally {await browser.close()}

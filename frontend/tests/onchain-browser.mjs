// Isolated Chromium DOM test of real owned components. No dev server, wallet or RPC.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtemp, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
const require = createRequire(import.meta.url);
const { chromium } = await import('/root/ui-research/node_modules/playwright/index.mjs');
const root = resolve(import.meta.dirname, '..');
const temp = await mkdtemp(resolve(tmpdir(), 'pactra-settlement-browser-'));
await writeFile(resolve(temp, 'package.json'), JSON.stringify({ type: 'module' }));
const modules = require.resolve('react').split('/react/')[0];
const provider = resolve(temp, 'provider.js'), wallet = resolve(temp, 'wallet.js'), next = resolve(temp, 'next.js'), loader = resolve(temp, 'loader.cjs'), entry = resolve(temp, 'entry.jsx');
await writeFile(provider, `import React from 'react';export const Context=React.createContext(null);export function useWorkspace(){return React.useContext(Context)}`);
await writeFile(wallet, `import React from 'react';export function WalletControl(){return <button>Test wallet control</button>}`);
await writeFile(next, `import React from 'react';export default function Link({children,prefetch,...props}){return <a {...props}>{children}</a>}`);
await writeFile(loader, `const ts=require(${JSON.stringify(require.resolve('typescript'))});module.exports=function(source){return ts.transpileModule(source,{compilerOptions:{jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText}`);
await writeFile(entry, `import React,{useState} from 'react';import{createRoot}from'react-dom/client';import{Context}from'./provider';import Arbiter from ${JSON.stringify(resolve(root,'components/arbiter-dashboard'))};import{WorkspaceConfirmation}from ${JSON.stringify(resolve(root,'components/tasks/task-shared'))};import{setWorkspaceIdentity}from ${JSON.stringify(resolve(root,'lib/workspace-client'))};
function Test(){const[status,S]=useState('signedOut');const[key,K]=useState(0);const[open,O]=useState(false);window.signIn=()=>{setWorkspaceIdentity({address:'0x1111111111111111111111111111111111111111',chainId:31337});S('signedIn');K(k=>k+1)};window.signOut=()=>{setWorkspaceIdentity(null);S('signedOut');K(k=>k+1)};window.calls=0;return <Context.Provider value={{status,address:status==='signedIn'?'0x1111111111111111111111111111111111111111':null,sessionKey:key,config:{enabled:true,chain:{id:31337}}}}><main id="main-content"><Arbiter/><button onClick={()=>O(true)}>Test confirmation</button>{open&&<WorkspaceConfirmation title="Transaction test" description="Explicit synthetic DOM test; no transaction." acknowledgement="Confirm exact amount" confirmLabel="Continue to wallet" onDismiss={()=>O(false)} onConfirm={()=>{window.calls++;O(false)}}><p>100 base units</p></WorkspaceConfirmation>}</main></Context.Provider>};createRoot(document.getElementById('root')).render(<Test/>);`);
const { webpack } = require('next/dist/compiled/webpack/webpack');
await new Promise((done, reject) => webpack({ mode:'development',devtool:false,entry,output:{path:temp,filename:'bundle.js'},resolve:{extensions:['.js','.jsx','.ts','.tsx'],modules:[modules],alias:{[resolve(root,'components/workspace-provider')]:provider,[resolve(root,'components/wallet-control')]:wallet,'next/link':next}},module:{rules:[{test:/\.[jt]sx?$/,resolve:{fullySpecified:false},exclude:/node_modules/,use:loader}]}},(error,stats)=>error||stats.hasErrors()?reject(error||Error(stats.toString({all:false,errors:true}))):done()));
const browser = await chromium.launch({ executablePath:'/root/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome',headless:true,args:['--no-sandbox'] });
try {
  const page = await browser.newPage({viewport:{width:390,height:900}});
  const errors=[], requests=[];
  page.on('pageerror',error=>{ errors.push(error.message); console.error('Browser fixture error:', error.message); });
  await page.route('http://pactra.test/**',async route=>{
    const path = new URL(route.request().url()).pathname;
    if(path==='/bundle.js')return route.fulfill({contentType:'text/javascript',body:await readFile(resolve(temp,'bundle.js'),'utf8')});
    if(path.startsWith('/api/workspace')){requests.push(path);return route.fulfill({json:path.endsWith('/onchain/config')?{enabled:false,chain_id:'31337',escrow_address:'',confirmations:0,attestation_available:false}:{disputes:[],next_cursor:null}})}
    return route.fulfill({contentType:'text/html',body:'<!doctype html><div id="root"></div><script src="/bundle.js"></script>'});
  });
  await page.goto('http://pactra.test/');
  await page.getByRole('heading',{name:'Sign in to read nominated cases'}).waitFor();
  assert.deepEqual(requests,[]);
  await page.evaluate(()=>window.signIn());
  await page.getByRole('heading',{name:'No nominated disputes returned'}).waitFor();
  assert.deepEqual([...requests].sort(),['/api/workspace/arbiter/disputes','/api/workspace/onchain/config']);
  await page.getByText('No escrow contract is configured.',{exact:false}).waitFor();
  await page.getByRole('button',{name:'Test confirmation',exact:true}).click();
  const dialog=page.getByRole('dialog',{name:'Transaction test'});await dialog.waitFor();
  assert.ok(await page.getByRole('button',{name:'Continue to wallet'}).isDisabled());
  await page.getByRole('checkbox').check();
  await page.evaluate(()=>window.signOut());
  await dialog.waitFor({state:'hidden'});
  assert.equal(await page.evaluate(()=>window.calls),0);
  await page.getByRole('heading',{name:'Sign in to read nominated cases'}).waitFor();
  assert.equal(await page.getByRole('heading',{name:'No nominated disputes returned'}).count(),0);
  assert.deepEqual(errors,[]);
  console.log(JSON.stringify({result:'passed',checks:['signed-out no private fetch','only explicit queue/config fetch','disabled deployment shown','Radix requires acknowledgement','logout removes private subtree and confirmation without sending'],scope:'isolated real component DOM, mocked backend/provider, no CSS visual or wallet integration claim',artifact:temp}));
} finally {await browser.close()}

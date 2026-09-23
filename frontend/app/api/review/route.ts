import { BodyTooLarge, readBoundedBody } from '../../../lib/bounded-body.ts';
export const runtime='nodejs';
export const maxDuration=40;
const fail=(status:number,code:string,message:string)=>Response.json({error:{code,message}},{status,headers:{'Cache-Control':'no-store'}});
export async function POST(request:Request){
 if(process.env.NODE_ENV==='production')return fail(503,'AI_DISABLED','Public AI review is disabled until authenticated per-user budgets are available.');
 if(request.headers.get('sec-fetch-site')==='cross-site')return fail(403,'ORIGIN_REJECTED','Cross-site requests are not allowed.');
 if(request.headers.get('content-type')?.split(';')[0].trim().toLowerCase()!=='application/json')return fail(415,'INVALID_TYPE','Send JSON.');
 let body:string;
 try{body=await readBoundedBody(request.body,16*1024);JSON.parse(body)}catch(e){return fail(e instanceof BodyTooLarge?413:400,'INVALID_INPUT','Invalid or oversized review input.');}
 try{
 const base=new URL(process.env.GO_API_URL||'http://127.0.0.1:8080');
 if(!['http:','https:'].includes(base.protocol)||base.username||base.password)throw Error();
 const r=await fetch(new URL('/api/v1/review',base.origin),{method:'POST',headers:{'Content-Type':'application/json'},body,redirect:'error',signal:AbortSignal.timeout(35000),cache:'no-store'});
 if(!r.ok){await r.body?.cancel();const status=[400,413,429,503,504].includes(r.status)?r.status:502;return fail(status,'AI_UNAVAILABLE',status===429?'Review busy. Wait before retrying.':status===503?'AI review is not configured.':'AI review unavailable. Deterministic checks still work.');}
 const d=JSON.parse(await readBoundedBody(r.body,256*1024));
 if(d.status!=='completed'||d.advisory!==true||!Array.isArray(d.findings)||!d.findings.length||d.findings.length>20||!d.findings.every((f:Record<string,unknown>)=>f&&typeof f.key==='string'&&['supported','concern','uncertain'].includes(String(f.assessment))&&['source_excerpt','submission_excerpt','explanation'].every(k=>typeof f[k]==='string')))return fail(502,'INVALID_RESPONSE','AI returned an invalid review.');
 return Response.json({status:'completed',advisory:true,findings:d.findings.map((f:Record<string,unknown>)=>({key:f.key,assessment:f.assessment,source_excerpt:f.source_excerpt,submission_excerpt:f.submission_excerpt,explanation:f.explanation}))},{headers:{'Cache-Control':'no-store'}});
 }catch{return fail(502,'AI_UNAVAILABLE','AI review unavailable. No result has been fabricated.');}
}

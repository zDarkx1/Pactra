import test from 'node:test';
import assert from 'node:assert/strict';
import { POST } from '../app/api/check/route.ts';
test('browser same-origin requests survive Next internal hostname reconstruction', async()=>{
 const original=globalThis.fetch;
 globalThis.fetch=async()=>Response.json({checker_version:'localization-v1',passed:false,checks:[{id:'placeholders',key:'greeting',status:'fail',message:'Different'}],ai_review:{status:'not_configured',message:'Semantic review is not implemented. Human review required.'}});
 try {const r=await POST(new Request('http://localhost:3000/api/check',{method:'POST',headers:{origin:'http://127.0.0.1:3000','sec-fetch-site':'same-origin','content-type':'application/json'},body:'{}'}));assert.equal(r.status,200)} finally{globalThis.fetch=original}
});
test('cross-site browser calls rejected',async()=>{const r=await POST(new Request('http://localhost/api/check',{method:'POST',headers:{'sec-fetch-site':'cross-site','content-type':'application/json'},body:'{}'}));assert.equal(r.status,403)});

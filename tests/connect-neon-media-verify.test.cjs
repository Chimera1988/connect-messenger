'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createHash}=require('node:crypto');
const {verifyMirrorReadback}=require('../lib/connect-neon-media-verify.cjs');
const id='12345678-1234-4234-9234-123456789012';
const bucket='connect-avatars', key=id+'/avatar-1794828102862.jpg';
const url='https://br-hidden-math-b9gifypl.storage.c-7.eu-central-1.aws.neon.tech/'+bucket+'/'+key+'?X-Amz-Signature=valid';
const bytes=Buffer.from('Private test media; no user content');
const sha=createHash('sha256').update(bytes).digest('hex');
const valid=()=>({url,bucket,path:key,expectedBytes:bytes.length,expectedSha256:sha});
test('Neon mirror read-back validates private signed GET by byte length and SHA-256',async()=>{
 let called=0;
 const fetchImpl=async(given,init)=>{called++;assert.equal(given,url);assert.equal(init.redirect,'error');assert.equal(init.cache,'no-store');return new Response(bytes,{status:200});};
 assert.equal(await verifyMirrorReadback({...valid(),fetchImpl}),true);
 assert.equal(called,1);
});
test('Neon mirror read-back refuses divergent bytes regardless of same length',async()=>{
 const mutated=Buffer.from(bytes);mutated[0]^=1;
 await assert.rejects(()=>verifyMirrorReadback({...valid(),fetchImpl:async()=>new Response(mutated,{status:200})}),/checksum/);
});
test('Neon mirror read-back refuses truncated content',async()=>{
 await assert.rejects(()=>verifyMirrorReadback({...valid(),fetchImpl:async()=>new Response(bytes.subarray(1),{status:200})}),/size/);
});
test('Neon mirror read-back refuses HTTP errors',async()=>{
 await assert.rejects(()=>verifyMirrorReadback({...valid(),fetchImpl:async()=>new Response('denied',{status:403})}),/status/);
});
test('Neon mirror read-back refuses alternate hosts, buckets and paths without fetching',async()=>{
 let calls=0;const fetchImpl=async()=>{calls++;return new Response(bytes,{status:200});};
 await assert.rejects(()=>verifyMirrorReadback({...valid(),url:url.replace('storage.c-7','storage.bad'),fetchImpl}),/URL/);
 await assert.rejects(()=>verifyMirrorReadback({...valid(),path:id+'/avatar-wrong.jpg',fetchImpl}),/URL/);
 assert.equal(calls,0);
});
test('Neon mirror read-back verifies exact hash and size declarations',async()=>{
 await assert.rejects(()=>verifyMirrorReadback({...valid(),expectedSha256:'x',fetchImpl:async()=>new Response(bytes)}),/digest/);
 await assert.rejects(()=>verifyMirrorReadback({...valid(),expectedBytes:0,fetchImpl:async()=>new Response(bytes)}),/size/);
});
test('production route uses presigned GET, classified failures, and original idempotent checkpoint',()=>{
 const fs=require('node:fs'),path=require('node:path');
 const source=fs.readFileSync(path.join(__dirname,'../app/api/connect-neon/admin/media-mirror/route.js'),'utf8');
 assert(source.includes('getSignedUrl(s3,new GetObjectCommand'));
 assert(source.includes('verifyMirrorReadback('));
 assert(source.includes('failure_stages:failureStages'));
 assert(source.includes('connect_neon_media_mirror_confirm'));
 assert(source.includes('connect_neon_media_mirror_failed'));
 assert(!source.includes('response.Body.transformToByteArray()'));
});

const test=require('node:test'),assert=require('node:assert/strict'),load=require('./helpers/load-ts.cjs');
test('a revoked JWT cannot reach the image decoder or read the conversion body',async()=>{
 let handler,decoded=0,read=0;
 const db={auth:{getUser:async()=>({data:{user:{id:'self'}},error:null})},rpc:async()=>({data:false,error:null}),from:()=>{const q={select:()=>q,eq:()=>q,maybeSingle:async()=>({data:{is_blocked:false}})};return q;}};
 load({'npm:@supabase/supabase-js@2.57.0':{createClient:()=>db},'npm:@imagemagick/magick-wasm@0.0.46':{ImageMagick:{read(){decoded++;}},MagickFormat:{},initializeImageMagick:async()=>{}}},{Deno:{env:{get:()=> 'fixture'},serve:fn=>handler=fn},atob})('supabase/functions/connect-sticker-webp-convert/index.ts');
 const token='header.'+Buffer.from(JSON.stringify({session_id:'11111111-1111-4111-8111-111111111111'})).toString('base64url')+'.signature';
 const response=await handler({method:'POST',headers:new Headers({authorization:'Bearer '+token}),arrayBuffer:async()=>{read++;return new ArrayBuffer(0);}});assert.equal(response.status,401);assert.equal(decoded,0);assert.equal(read,0);
});

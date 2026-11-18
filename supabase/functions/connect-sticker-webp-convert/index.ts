import {liveIdentity} from '../_shared/auth.ts';
import { createClient } from 'npm:@supabase/supabase-js@2.57.0';
import { ImageMagick, initializeImageMagick, MagickFormat } from 'npm:@imagemagick/magick-wasm@0.0.46';

const LIMIT=12*1024*1024, MAX_OUTPUT=2*1024*1024;
const cors={'Access-Control-Allow-Origin':'*','Access-Control-Expose-Headers':'X-Connect-Media-Type','Access-Control-Allow-Headers':'authorization, apikey, x-client-info, content-type','Access-Control-Allow-Methods':'OPTIONS, POST'};
const json=(data:Record<string,unknown>, status:number)=>new Response(JSON.stringify(data),{status,headers:{...cors,'Content-Type':'application/json'}});
const isWebp=(data:Uint8Array)=>data.length>=12 &&
  String.fromCharCode(...data.slice(0,4))==='RIFF' &&
  String.fromCharCode(...data.slice(8,12))==='WEBP';
const wasmUrl='https://unpkg.com/@imagemagick/magick-wasm@0.0.46/dist/x86/magick.wasm';
const knownHash='nU1H2MzkMXyN0sBaV9iW1x2Zr0VKxdKrUbQwWM7kF64=';
let magickReady:Promise<void>|undefined;
function ready():Promise<void>{
  if(!magickReady){
    magickReady=(async()=>{
      const response=await fetch(wasmUrl);
      if(!response.ok)throw Error('WebP encoder temporarily unavailable');
      const bytes=new Uint8Array(await response.arrayBuffer());
      const hash=new Uint8Array(await crypto.subtle.digest('SHA-256',bytes));
      const encoded=btoa(Array.from(hash,v=>String.fromCharCode(v)).join(''));
      if(encoded!==knownHash)throw Error('WebP encoder integrity error');
      await initializeImageMagick(bytes);
    })().catch(error=>{magickReady=undefined;throw error;});
  }
  return magickReady;
}
function signature(bytes:Uint8Array){
  const png=bytes.length>8&&[137,80,78,71,13,10,26,10].every((v,i)=>bytes[i]===v);
  const jpg=bytes.length>3&&bytes[0]===255&&bytes[1]===216&&bytes[2]===255;
  return png?'png':jpg?'jpeg':null;
}
function convert(bytes:Uint8Array):Uint8Array {
  if(!signature(bytes))throw Error('Only PNG and JPG are accepted');
  const output=ImageMagick.read(bytes,image=>{
    if(!image.width||!image.height||image.width*image.height>40_000_000)throw Error('Image dimensions out of range');
    const scale=Math.min(1,512/Math.max(image.width,image.height));
    if(scale<1)image.resize(Math.max(1,Math.round(image.width*scale)),Math.max(1,Math.round(image.height*scale)));
    image.quality=90;
    return image.write(MagickFormat.WebP,data=>Uint8Array.from(data));
  });
  if(!isWebp(output)||output.length>MAX_OUTPUT||output.length===0)throw Error('WebP output could not be generated');
  return output;
}
Deno.serve(async(req:Request)=>{
 if(req.method==='OPTIONS')return new Response(null,{status:204,headers:cors});
 if(req.method!=='POST')return json({error:'Method not allowed'},405);
 const url=Deno.env.get('SUPABASE_URL'),key=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
 if(!url||!key)return json({error:'Service unavailable'},503);
 const db=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
 const bearer=req.headers.get('Authorization')||'';
 const match=/^Bearer\s+(.+)$/i.exec(bearer);
 if(!match)return json({error:'Sign in required'},401);
 let user;try{user=await liveIdentity(db,match[1]);}catch{return json({error:'Authorization unavailable'},503);}
 if(!user)return json({error:'Invalid session'},401);
 const budget=await db.rpc('connect_consume_rate_limit',{p_user_id:user.id,p_action:'sticker-convert',p_limit:12,p_seconds:60});
 if(budget.error)return json({error:'Rate limiter unavailable'},503);if(budget.data!==true)return json({error:'Too many conversions'},429);
 const length=Number(req.headers.get('content-length')||'0');
 if(length>LIMIT)return json({error:'Maximum source file is 12 MB'},413);
 let input:Uint8Array;
 try{input=new Uint8Array(await req.arrayBuffer());}
 catch{return json({error:'Could not read image'},400);}
 if(!input.length||input.length>LIMIT)return json({error:'Image must be 1 byte to 12 MB'},413);
 if(!signature(input))return json({error:'Choose a JPG or PNG image'},415);
 try{
   await ready();
   const output=convert(input);
   return new Response(new Uint8Array(output).buffer,{status:200,headers:{...cors,'Content-Type':'application/octet-stream','X-Connect-Media-Type':'image/webp','Cache-Control':'no-store','Content-Length':String(output.length)}});
 }catch(error){
   console.error('Sticker WebP conversion failed',error instanceof Error?error.message:'unknown');
   return json({error:'WebP conversion failed on server'},503);
 }
});


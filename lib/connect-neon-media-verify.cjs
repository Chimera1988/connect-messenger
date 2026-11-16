'use strict';
const {createHash}=require('node:crypto');
const {validRedirectUrl}=require('./connect-neon-media-guards.cjs');
/** Server-side independent HTTP GET after S3 PUT. No object bytes leave this server. */
async function verifyMirrorReadback({url,bucket,path,expectedBytes,expectedSha256,fetchImpl=globalThis.fetch}){
 if(!validRedirectUrl(url,bucket,path))throw Error('Invalid destination verification URL');
 if(!Number.isSafeInteger(expectedBytes)||expectedBytes<1||expectedBytes>104857600)throw Error('Invalid declared size');
 if(typeof expectedSha256!=='string'||!/^[a-f0-9]{64}$/.test(expectedSha256))throw Error('Invalid declared digest');
 if(typeof fetchImpl!=='function')throw Error('Invalid fetch implementation');
 const result=await fetchImpl(url,{method:'GET',redirect:'error',cache:'no-store',signal:AbortSignal.timeout(30000)});
 if(!result.ok)throw Error('Destination verification status '+result.status);
 const bytes=Buffer.from(await result.arrayBuffer());
 if(bytes.length!==expectedBytes)throw Error('Destination verification size mismatch');
 const digest=createHash('sha256').update(bytes).digest('hex');
 if(digest!==expectedSha256)throw Error('Destination verification checksum mismatch');
 return true;
}
module.exports={verifyMirrorReadback};

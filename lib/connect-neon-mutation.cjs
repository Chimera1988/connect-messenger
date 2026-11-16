'use strict';
function allowMutation(request){
 try {
  const reqUrl=new URL(request.url);
  if(reqUrl.protocol!=='https:' && reqUrl.hostname!=='localhost')return false;
  const origin=request.headers.get('origin');
  // Browser cookie mutations require a same-origin Origin header. Native bearer
  // calls without Origin are not yet enabled for this migration.
  return !!origin&&origin===reqUrl.origin;
 }catch{return false;}
}
module.exports={allowMutation};

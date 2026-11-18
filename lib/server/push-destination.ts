type Subscription = {endpoint?:unknown;keys?:{p256dh?:unknown;auth?:unknown}};
type WebPushSubscription={endpoint:string;keys:{p256dh:string;auth:string}};

function base64Bytes(value:unknown):Buffer|null {
  if(typeof value!=='string'||value.length>128||!/^[A-Za-z0-9_-]+={0,2}$/.test(value))return null;
  try { return Buffer.from(value,'base64url'); } catch { return null; }
}

/** Browser endpoints are untrusted input, including records saved by older clients.
 * The push library does not follow redirects. TLS validates the provider hostname.
 * Keep destinations restricted to production push services, never arbitrary HTTPS.
 */
export function validPushSubscription(value:unknown,endpoint?:string):value is WebPushSubscription {
  if(!value||typeof value!=='object')return false;
  const sub=value as Subscription;
  if(typeof sub.endpoint!=='string'||sub.endpoint.length>4096||endpoint!==undefined&&sub.endpoint!==endpoint)return false;
  try {
    const url=new URL(sub.endpoint);
    const allowed=['fcm.googleapis.com','web.push.apple.com','updates.push.services.mozilla.com'];
    if(url.protocol!=='https:'||url.username||url.password||url.port||url.hash||
      !(allowed.includes(url.hostname)||url.hostname.endsWith('.notify.windows.com')))return false;
    const key=base64Bytes(sub.keys?.p256dh),auth=base64Bytes(sub.keys?.auth);
    return key?.length===65&&key[0]===4&&auth?.length===16;
  } catch { return false; }
}

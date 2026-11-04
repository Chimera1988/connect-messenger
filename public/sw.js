self.addEventListener('push', event => {
  let data={title:'Connect',body:'Новое сообщение'};
  try {data={...data,...event.data.json()};} catch {}
  event.waitUntil(self.registration.showNotification(data.title,{body:data.body,icon:'/icon-192.png',badge:'/icon-192.png',tag:data.messageId||undefined,data:{conversationId:data.conversationId||null}}));
});
self.addEventListener('notificationclick',event=>{
  event.notification.close();
  event.waitUntil((async()=>{
    const windows=await clients.matchAll({type:'window',includeUncontrolled:true});
    for(const client of windows){if(new URL(client.url).origin===self.location.origin){await client.focus();client.postMessage({type:'CONNECT_OPEN_CHAT',conversationId:event.notification.data?.conversationId});return;}}
    await clients.openWindow('/');
  })());
});

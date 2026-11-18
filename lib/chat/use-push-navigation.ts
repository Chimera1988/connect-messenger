'use client';
import { useEffect,useRef,useState } from 'react';
import { navigationDecision,type ChatNavigationIntent } from './navigation-intent';

export function usePushNavigation(userId:string|null,chats:readonly string[],ready:boolean,open:(id:string)=>void) {
  const [intent,setIntent]=useState<ChatNavigationIntent|null>(null);
  const openRef=useRef(open);openRef.current=open;
  const ids=chats.join(',');
  useEffect(()=>{
    const url=new URL(window.location.href),id=url.searchParams.get('conversation');
    if(id)setIntent({conversationId:id,userId:url.searchParams.get('connect_user')});
    const receive=(event:MessageEvent)=>{
      if(event.data?.type==='CONNECT_OPEN_CHAT'&&typeof event.data.conversationId==='string')
        setIntent({conversationId:event.data.conversationId,userId:typeof event.data.userId==='string'?event.data.userId:null});
    };
    navigator.serviceWorker?.addEventListener('message',receive);
    return()=>navigator.serviceWorker?.removeEventListener('message',receive);
  },[]);
  useEffect(()=>{
    if(!intent)return;
    const decision=navigationDecision(intent,userId,ids?ids.split(','):[],ready);
    if(decision==='wait')return;
    setIntent(null);
    const url=new URL(window.location.href);url.searchParams.delete('conversation');url.searchParams.delete('connect_user');
    window.history.replaceState(window.history.state,'',url.pathname+url.search+url.hash);
    if(decision==='open')openRef.current(intent.conversationId);
  },[intent,userId,ids,ready]);
}

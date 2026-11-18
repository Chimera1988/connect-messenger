'use client';
import type { SupabaseClient } from '@supabase/supabase-js';
import { useEffect,useRef,type RefObject } from 'react';
import type { Database } from '../database';
import { createReconciler } from '../realtime/reconciler';
import { sessionScope } from '../session-scope';
import type { Message,Profile } from './model';
export type InboxRow={conversation_id:string;latest:Message|null;unread_count:number;incoming_at:string|null;states:{user_id:string;conversation_id:string;last_delivered_at:string|null;last_read_at:string;activity_kind:string|null;activity_until:string|null;typing_until:string|null;recording_until:string|null}[]};
type Options={read:RefObject<Record<string,string>>;visibility:RefObject<{hiddenMessages:string[];clearedChats:Record<string,string>}>;
 onRows:(rows:InboxRow[],changed:boolean)=>void;onProfile:(profile:Profile)=>void;onDirectory:()=>void;onError:()=>void};
/** Owns transport lifetime only. Page presentation consumes typed snapshots. */
export function useInbox(client:SupabaseClient<Database>|null,userId:string|null,options:Options){
 const current=useRef(options);current.current=options;
 useEffect(()=>{
  if(!client||!userId)return;const operation=sessionScope.capture();let alive=true,signature='';
  const valid=()=>alive&&sessionScope.current(operation);
  const sync=createReconciler(async()=>{
   const {hiddenMessages,clearedChats}=current.current.visibility.current;
   const {data,error}=await client.rpc('connect_inbox_summary',{p_read:current.current.read.current,p_cleared:clearedChats,p_hidden:hiddenMessages.filter(id=>/^[a-f0-9-]{36}$/i.test(id))});
   if(!valid())return;if(error){current.current.onError();throw error;}
   const rows=(data||[])as unknown as InboxRow[];
   if(!rows.every(row=>typeof row.conversation_id==='string'&&Array.isArray(row.states)))throw Error('Invalid inbox summary');
   const next=JSON.stringify(rows);current.current.onRows(rows,next!==signature);signature=next;
  },{visible:()=>document.visibilityState!=='hidden'});
  const channel=client.channel('connect-inbox-'+userId)
   .on('postgres_changes',{event:'*',schema:'public',table:'messages'},()=>{void sync.trigger();})
   .on('postgres_changes',{event:'*',schema:'public',table:'conversation_user_state'},()=>{void sync.trigger();})
   .on('postgres_changes',{event:'*',schema:'public',table:'conversations'},()=>{if(valid())current.current.onDirectory();void sync.trigger();})
   .on('postgres_changes',{event:'*',schema:'public',table:'profiles'},payload=>{if(!valid())return;const profile=payload.new as Profile;if(profile?.id)current.current.onProfile(profile);})
   .subscribe(status=>{sync.setHealthy(status==='SUBSCRIBED');if(status==='SUBSCRIBED')void sync.trigger();});
  const invalidate=()=>{void sync.trigger();};
  const visible=()=>{if(document.visibilityState==='visible'){invalidate();if(valid())current.current.onDirectory();}};
  document.addEventListener('visibilitychange',visible);window.addEventListener('online',visible);window.addEventListener('connect:inbox-invalidated',invalidate);void sync.trigger();
  return()=>{alive=false;sync.stop();document.removeEventListener('visibilitychange',visible);window.removeEventListener('online',visible);window.removeEventListener('connect:inbox-invalidated',invalidate);void client.removeChannel(channel);};
 },[client,userId]);
}

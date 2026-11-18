'use client';
import { useCallback,useEffect,useState,useSyncExternalStore,type Dispatch,type SetStateAction } from 'react';
import { sessionScope } from '../session-scope';
import { ComposerStore } from './composer-store';

export function useChatComposer(userId:string|null,chatId:string|null) {
  const [store]=useState(()=>new ComposerStore());
  useEffect(()=>sessionScope.onReset(()=>store.clear()),[store,userId]);
  const value=useSyncExternalStore(store.subscribe,()=>store.get(userId,chatId),()=>store.get(null,null));
  const setDraft=useCallback<Dispatch<SetStateAction<string>>>(next=>{
    const previous=store.get(userId,chatId).draft;
    store.update(userId,chatId,{draft:typeof next==='function'?next(previous):next});
  },[store,userId,chatId]);
  const setPendingFiles=useCallback<Dispatch<SetStateAction<File[]>>>(next=>{
    const previous=store.get(userId,chatId).files;
    store.update(userId,chatId,{files:typeof next==='function'?next(previous):next});
  },[store,userId,chatId]);
  return {draft:value.draft,pendingFiles:value.files,setDraft,setPendingFiles};
}

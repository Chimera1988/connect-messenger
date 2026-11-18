'use client';

import { useEffect } from 'react';

/** Dismiss state through explicit callbacks; React owns menu visibility. */
export default function ConnectUiCoordinator({root,closeChat,closeList}:{root:React.RefObject<HTMLElement|null>;closeChat:()=>void;closeList:()=>void}) {
 useEffect(()=>{
  const onPointer=(event:PointerEvent)=>{const target=event.target;if(!(target instanceof Element)||!root.current?.contains(target))return;
   if(!target.closest('.chat-actions-menu,.chat-clear-btn'))closeChat();if(!target.closest('.list-chat-popover'))closeList();};
  const onKey=(event:KeyboardEvent)=>{if(event.key==='Escape'){closeChat();closeList();}};
  const onScroll=(event:Event)=>{if(event.target instanceof Element&&event.target.closest('.chat-view .message-scroll,.main-view .scroll-content')){closeChat();closeList();}};
  document.addEventListener('pointerdown',onPointer,true);document.addEventListener('keydown',onKey,true);document.addEventListener('scroll',onScroll,true);
  return()=>{document.removeEventListener('pointerdown',onPointer,true);document.removeEventListener('keydown',onKey,true);document.removeEventListener('scroll',onScroll,true);};
 },[root,closeChat,closeList]);return null;
}

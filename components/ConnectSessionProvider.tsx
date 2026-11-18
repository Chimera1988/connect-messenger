'use client';
import type { User } from '@supabase/supabase-js';
import { createContext,useCallback,useContext,useMemo,useRef,useState,type Dispatch,type ReactNode,type SetStateAction } from 'react';
import { setPushSession } from '../lib/push/session';
import { sessionScope } from '../lib/session-scope';
import { browserSupabase } from '../lib/supabase-browser';

export type ActiveConversation={conversationId:string;peerId:string;peerName:string};
type ConnectSession={admin:boolean;setAdmin:Dispatch<SetStateAction<boolean>>;user:User|null;setUser:Dispatch<SetStateAction<User|null>>;client:ReturnType<typeof browserSupabase>;
  conversation:ActiveConversation|null;setConversation:(value:ActiveConversation|null)=>void};
const Context=createContext<ConnectSession|null>(null);

/** Only Home's live auth verification may publish an authenticated identity.
 * Other features consume it instead of trusting independent cached SDK sessions.
 */
export default function ConnectSessionProvider({children}:{children:ReactNode}) {
  const [admin,setAdmin]=useState(false);
  const [user,setIdentity]=useState<User|null>(null);
  const identity=useRef<User|null>(null);
  const [conversation,setActive]=useState<ActiveConversation|null>(null);
  const setUser=useCallback<Dispatch<SetStateAction<User|null>>>((next)=>{
    const value=typeof next==='function'?next(identity.current):next;
    if(identity.current?.id!==value?.id){sessionScope.setUser(value?.id||null);setAdmin(false);setActive(null);setPushSession(value?.id||null);}
    identity.current=value;setIdentity(value);
  },[]);
  const setConversation=useCallback((value:ActiveConversation|null)=>{sessionScope.setChat(value?.conversationId||null);setActive(value);},[]);
  const value=useMemo(()=>({user,setUser,admin,setAdmin,client:browserSupabase(),conversation,setConversation}),[user,setUser,admin,conversation,setConversation]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
export function useConnectSession():ConnectSession {const value=useContext(Context);if(!value)throw new Error('Connect session provider missing');return value;}

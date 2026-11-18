'use client';
import { createContext,useCallback,useContext,useMemo,useState,type ReactNode } from 'react';
type Slot='main'|'nav'|'settings';
type Hosts=Record<Slot,HTMLElement|null>;
const Context=createContext<{hosts:Hosts;set:(slot:Slot,element:HTMLElement|null)=>void}|null>(null);
export default function ConnectUiSlots({children}:{children:ReactNode}){
 const [hosts,setHosts]=useState<Hosts>({main:null,nav:null,settings:null});
 const set=useCallback((slot:Slot,element:HTMLElement|null)=>setHosts(current=>current[slot]===element?current:{...current,[slot]:element}),[]);
 const value=useMemo(()=>({hosts,set}),[hosts,set]);return <Context.Provider value={value}>{children}</Context.Provider>;
}
export function useUiHosts(){const value=useContext(Context);if(!value)throw Error('UI slots provider missing');return value;}
export function useUiSlot(slot:Slot){const {set}=useUiHosts();return useCallback((element:HTMLElement|null)=>set(slot,element),[set,slot]);}

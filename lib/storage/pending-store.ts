/** One storage record per intent: independent tabs cannot overwrite each
 * other's read/modify/write arrays. Quota/private-mode failures retain RAM retry. */
export function pendingStore<T>(namespace:string,id:(row:T)=>string,valid:(value:unknown,owner:string)=>value is T){
 const memory=new Map<string,T>(),prefix=(owner:string)=>namespace+':'+owner+':';
 return {
  put(owner:string,row:T){const key=prefix(owner)+id(row);memory.set(key,row);try{localStorage.setItem(key,JSON.stringify(row));}catch{}},
  remove(owner:string,row:T){const key=prefix(owner)+id(row);memory.delete(key);try{localStorage.removeItem(key);}catch{}},
  list(owner:string):T[]{
   const result=new Map<string,T>();try{for(let i=0;i<localStorage.length;i++){const key=localStorage.key(i);if(!key?.startsWith(prefix(owner)))continue;try{const value:unknown=JSON.parse(localStorage.getItem(key)||'null');if(valid(value,owner))result.set(key,value);}catch{}}}catch{}
   for(const [key,row]of memory)if(key.startsWith(prefix(owner))&&valid(row,owner))result.set(key,row);
   return [...result.values()];
  }
 };
}

export type ComposerValue={draft:string;files:File[]};
const EMPTY:ComposerValue={draft:'',files:[]};
export class ComposerStore {
  private rows=new Map<string,ComposerValue>();
  private listeners=new Set<()=>void>();
  private key(user:string|null,chat:string|null){return JSON.stringify([user,chat]);}
  get(user:string|null,chat:string|null):ComposerValue {return user&&chat?this.rows.get(this.key(user,chat))||EMPTY:EMPTY;}
  update(user:string|null,chat:string|null,patch:Partial<ComposerValue>):void {
    if(!user||!chat)return;
    this.rows.set(this.key(user,chat),{...this.get(user,chat),...patch});this.emit();
  }
  clear():void {this.rows.clear();this.emit();}
  subscribe=(notify:()=>void)=>{this.listeners.add(notify);return()=>{this.listeners.delete(notify);};};
  private emit(){for(const notify of this.listeners)notify();}
}

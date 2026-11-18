export type OperationTicket={userId:string|null;session:number;chat:string|null;navigation:number};

/** Synchronous invalidation precedes React rendering and async SDK cleanup. */
export class SessionScope {
  private userId:string|null=null;
  private chat:string|null=null;
  private session=0;
  private navigation=0;
  private cleanups=new Set<()=>void>();
  setUser(userId:string|null):void {
    if(this.userId===userId)return;
    this.userId=userId;this.session++;this.chat=null;this.navigation++;
    const callbacks=[...this.cleanups];this.cleanups.clear();
    for(const stop of callbacks)try{stop();}catch{/* Other resources still require cleanup. */}
  }
  setChat(chat:string|null):void {if(this.chat!==chat){this.chat=chat;this.navigation++;}}
  capture(chat:string|null=null):OperationTicket {return {userId:this.userId,session:this.session,chat,navigation:this.navigation};}
  current(ticket:OperationTicket):boolean {
    return !!ticket.userId&&ticket.userId===this.userId&&ticket.session===this.session&&
      (ticket.chat===null||ticket.chat===this.chat&&ticket.navigation===this.navigation);
  }
  onReset(stop:()=>void):()=>void {this.cleanups.add(stop);return()=>{this.cleanups.delete(stop);};}
}
export const sessionScope=new SessionScope();

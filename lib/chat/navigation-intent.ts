export type ChatNavigationIntent={conversationId:string;userId:string|null};
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function navigationDecision(intent:ChatNavigationIntent,userId:string|null,chats:readonly string[],ready:boolean):'open'|'wait'|'reject' {
  if(!uuid.test(intent.conversationId))return 'reject';
  if(!userId)return 'wait';
  if(intent.userId&&intent.userId!==userId)return 'reject';
  if(!ready)return 'wait';
  return chats.includes(intent.conversationId)?'open':'reject';
}

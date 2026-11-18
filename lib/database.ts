import type { Json,Database as Snapshot } from './generated/database';
export type { Json };
type Public=Snapshot['public'];
export type PushDevice=Public['Tables']['push_devices']['Row'] & {session_id?:string|null};
// Deployed schema snapshot plus reviewed additive upgrades. Regenerate the
// snapshot after deployment; remove the overlay only when it contains these RPCs.
export type Database=Omit<Snapshot,'public'> & {public:Omit<Public,'Functions'> & {Functions:Public['Functions'] & {
 connect_inbox_summary:{Args:{p_read?:Json;p_cleared?:Json;p_hidden?:string[]};Returns:{conversation_id:string;latest:Json;unread_count:number;incoming_at:string|null;states:Json}[]};
 connect_push_targets:{Args:{p_user_ids:string[]};Returns:PushDevice[]};
 connect_register_push_device:{Args:{p_user_id:string;p_session_id:string;p_platform:string;p_endpoint:string;p_subscription:Json};Returns:boolean};
 connect_consume_rate_limit:{Args:{p_user_id:string;p_action:string;p_limit:number;p_seconds:number};Returns:boolean};
 connect_upload_lease:{Args:{p_id:string;p_chat:string;p_paths?:string[];p_action?:'begin'|'finish'|'abandon'};Returns:undefined};
 connect_heartbeat_audio_call:{Args:{p_call_id:string;p_answer_sha256?:string|null};Returns:boolean};
 connect_gc_candidates:{Args:{p_kind:'media'|'sticker'|'account';p_sender?:string|null;p_message?:string|null;p_limit?:number};Returns:Json[]};
 connect_gc_prepare:{Args:{p_bucket:string;p_path:string;p_worker:string};Returns:boolean};
 connect_gc_ack:{Args:{p_bucket:string;p_path:string;p_worker:string};Returns:boolean};
}}};

export { };
type NativeCommands={
 appearance:{payload:{scene:'waves'|'aurora'|'moon'|'sunset'|'lagoon'|'nebula'|'minimal'};result:void};
 'navigation:exit':{payload:undefined;result:void};
 clipboard:{payload:{text:string};result:void};
 'recordVoice:start':{payload:undefined;result:void};
 'recordVoice:cancel':{payload:undefined;result:void};
 'recordVoice:stop':{payload:{send:boolean};result:File|null};
 'recordVideo:open':{payload:undefined;result:File|null};
 'vault:seal':{payload:{name:string;value:string};result:string};
 'vault:open':{payload:{name:string;value:string};result:string};
};
declare global {interface Window {
 ConnectNative?:{request<C extends keyof NativeCommands>(command:C,...args:NativeCommands[C]['payload'] extends undefined?[]:[payload:NativeCommands[C]['payload']]):Promise<NativeCommands[C]['result']>};
 __connectNativeCall?:{phase:'idle'|'incoming'|'preparing'|'ringing'|'connecting'|'active'|'reconnecting';callId?:string};
 __connectPrepareSession?:(session:import('@supabase/supabase-js').Session|null)=>Promise<void>;
}}

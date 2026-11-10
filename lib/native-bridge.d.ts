export {};
declare global { interface Window {
 ConnectNative?:{request:(command:string,payload?:unknown)=>Promise<any>};
 __connectNativeCall?:any;
 __connectPrepareSession?:(session:import('@supabase/supabase-js').Session|null)=>Promise<void>;
}}

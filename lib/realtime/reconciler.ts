type Timer=ReturnType<typeof setTimeout>;
type Options={schedule?:typeof setTimeout;cancel?:typeof clearTimeout;visible?:()=>boolean};
/** Event invalidation plus bounded recovery polling; one request at a time. */
export function createReconciler(run:()=>Promise<unknown>,options:Options={}){
 const schedule=options.schedule||setTimeout,cancel=options.cancel||clearTimeout;
 let stopped=false,running=false,dirty=false,healthy=false,failures=0,timer:Timer|undefined;
 const arm=()=>{if(timer)cancel(timer);if(!stopped)timer=schedule(()=>{void trigger();},Math.min(60000,(healthy?30000:5000)*2**Math.min(failures,3)));};
 async function trigger(){
  if(stopped)return;if(running){dirty=true;return;}
  if(options.visible&&!options.visible()){arm();return;}
  if(timer)cancel(timer);running=true;
  try{await run();failures=0;}catch{failures++;}
  finally{running=false;if(!stopped){if(dirty){dirty=false;void trigger();}else arm();}}
 }
 return {trigger,setHealthy(value:boolean){healthy=value;if(!running)arm();},stop(){stopped=true;if(timer)cancel(timer);}};
}

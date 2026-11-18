const SESSION='22222222-2222-4222-8222-222222222222';
exports.token=user=>'Bearer header.'+Buffer.from(JSON.stringify({sub:user,session_id:SESSION})).toString('base64url')+'.signature';
exports.decorate=(db,user,allowed=true)=>{
 db.auth={getUser:async()=>({data:{user:allowed?{id:user}:null},error:null})};
 const rpc=db.rpc?.bind(db);db.rpc=(name,args)=>name==='connect_auth_session_active'||name==='connect_consume_rate_limit'?Promise.resolve({data:true,error:null}):rpc(name,args);
 return db;
};

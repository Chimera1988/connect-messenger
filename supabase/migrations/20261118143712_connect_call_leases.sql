begin;
create table if not exists private.connect_call_leases(
 call_id uuid not null references public.connect_calls(id) on delete cascade,
 user_id uuid not null,expires_at timestamptz not null,primary key(call_id,user_id)
);
alter table private.connect_call_leases enable row level security;
revoke all on private.connect_call_leases from public,anon,authenticated;
create or replace function private.connect_expire_call_leases() returns void
language sql security definer set search_path='' as $$
 update public.connect_calls c set status='ended',ended_at=now() where c.status='active'
 and exists(select 1 from private.connect_call_leases l where l.call_id=c.id and l.user_id=c.caller_id)
 and exists(select 1 from private.connect_call_leases l where l.call_id=c.id and l.user_id=c.callee_id)
 and not exists(select 1 from private.connect_call_leases l where l.call_id=c.id and l.expires_at>=now());
$$;
revoke all on function private.connect_expire_call_leases() from public,anon,authenticated;
create or replace function public.connect_heartbeat_audio_call(p_call_id uuid,p_answer_sha256 text default null)
returns boolean language plpgsql security definer set search_path='' as $$
declare c public.connect_calls;
begin
 if not public.connect_has_live_session() then raise exception 'Active session required';end if;
 select * into c from public.connect_calls where id=p_call_id for update;
 if not found or auth.uid() not in(c.caller_id,c.callee_id) or c.status<>'active' then return false;end if;
 if auth.uid()=c.callee_id and (p_answer_sha256 is null or c.answer->>'sdp' is null or p_answer_sha256<>encode(sha256(convert_to(c.answer->>'sdp','UTF8')),'hex')) then return false;end if;
 insert into private.connect_call_leases(call_id,user_id,expires_at)values(c.id,auth.uid(),now()+interval '120 seconds')
 on conflict(call_id,user_id)do update set expires_at=excluded.expires_at;
 -- A returning live owner renews before expiring abandoned calls.
 perform private.connect_expire_call_leases();
 return true;
end $$;
revoke all on function public.connect_heartbeat_audio_call(uuid,text) from public,anon;
grant execute on function public.connect_heartbeat_audio_call(uuid,text) to authenticated;
-- Calls using older clients keep the established 8h compatibility fallback.
-- Recheck upgraded leases before a new call competes for the busy index.
CREATE OR REPLACE FUNCTION public.connect_start_audio_call(p_conversation_id uuid, p_offer jsonb)
 RETURNS connect_calls
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_me uuid := auth.uid(); v_peer uuid; v_pair record; v_result public.connect_calls;
begin
  perform private.connect_expire_call_leases();
  if v_me is null then raise exception 'Not authenticated'; end if;
  if p_offer->>'type' <> 'offer' or length(coalesce(p_offer->>'sdp','')) not between 20 and 65000 then
    raise exception 'Invalid audio offer';
  end if;
  select c.user_a,c.user_b into v_pair from public.conversations c
    where c.id=p_conversation_id and v_me in(c.user_a,c.user_b);
  if not found then raise exception 'Conversation not found'; end if;
  v_peer := case when v_pair.user_a=v_me then v_pair.user_b else v_pair.user_a end;
  if not exists (select 1 from public.profiles p where p.id=v_me and not p.is_blocked)
    or not exists (select 1 from public.profiles p where p.id=v_peer and not p.is_blocked) then
    raise exception 'Call unavailable';
  end if;
  update public.connect_calls set status='missed',ended_at=now()
    where conversation_id=p_conversation_id and status='ringing'
      and created_at < now()-interval '60 seconds';
  update public.connect_calls set status='ended',ended_at=now()
    where conversation_id=p_conversation_id and status='active'
      and created_at < now()-interval '8 hours';
  insert into public.connect_calls(conversation_id,caller_id,callee_id,offer)
    values(p_conversation_id,v_me,v_peer,p_offer) returning * into v_result;
  return v_result;
end;$function$
;
commit;

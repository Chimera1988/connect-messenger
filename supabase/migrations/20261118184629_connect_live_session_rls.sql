begin;
create or replace function public.connect_has_live_session()returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from auth.sessions s join public.profiles p on p.id=s.user_id
 where s.id::text=(auth.jwt()->>'session_id')and s.user_id=auth.uid()
 and(s.not_after is null or s.not_after>now())and not p.is_blocked);
$$;
-- Restrictive guards compose with the existing participant/visibility policies.
do $$declare t text;begin
 for t in select tablename from pg_tables where schemaname='public'and rowsecurity loop
  execute format('drop policy if exists connect_live_session_guard on public.%I',t);
  execute format('create policy connect_live_session_guard on public.%I as restrictive for all to authenticated using((select public.connect_has_live_session()))with check((select public.connect_has_live_session()))',t);
 end loop;
end $$;
drop policy if exists connect_live_session_guard on storage.objects;
create policy connect_live_session_guard on storage.objects as restrictive for all to authenticated
using(bucket_id not in('connect-attachments','connect-avatars','connect-profile-media','connect-stickers')or(select public.connect_has_live_session()))
with check(bucket_id not in('connect-attachments','connect-avatars','connect-profile-media','connect-stickers')or(select public.connect_has_live_session()));
CREATE OR REPLACE FUNCTION public.connect_start_audio_call(p_conversation_id uuid, p_offer jsonb)
 RETURNS connect_calls
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_me uuid := auth.uid(); v_peer uuid; v_pair record; v_result public.connect_calls;
begin
  if not public.connect_has_live_session() then raise exception 'Active session required';end if;
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
CREATE OR REPLACE FUNCTION public.connect_answer_audio_call(p_call_id uuid, p_answer jsonb)
 RETURNS connect_calls
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_result public.connect_calls;
begin
  if not public.connect_has_live_session() then raise exception 'Active session required';end if;
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if p_answer->>'type' <> 'answer' or length(coalesce(p_answer->>'sdp','')) not between 20 and 65000 then
    raise exception 'Invalid audio answer';
  end if;
  update public.connect_calls
    set answer=p_answer,status='active',answered_at=now()
    where id=p_call_id and callee_id=auth.uid() and status='ringing'
      and created_at>now()-interval '60 seconds'
    returning * into v_result;
  if not found then raise exception 'Call unavailable or already answered'; end if;
  return v_result;
end;$function$
;
CREATE OR REPLACE FUNCTION public.connect_finish_audio_call(p_call_id uuid, p_reason text DEFAULT 'hangup'::text)
 RETURNS connect_calls
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_call public.connect_calls; v_state text;
begin
  if not public.connect_has_live_session() then raise exception 'Active session required';end if;
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  select * into v_call from public.connect_calls where id=p_call_id for update;
  if not found or auth.uid() not in(v_call.caller_id,v_call.callee_id) then
    raise exception 'Call unavailable';
  end if;
  if v_call.status not in('ringing','active') then return v_call; end if;
  -- connect-call-response-owner-v1
  if p_reason in ('decline', 'busy') and v_call.status <> 'ringing' then return v_call; end if;
  v_state := case
    when v_call.status='ringing' and v_call.callee_id=auth.uid() and p_reason='decline' then 'declined'
    when v_call.status='ringing' and v_call.callee_id=auth.uid() and p_reason='busy' then 'busy'
    when v_call.status='ringing' and v_call.caller_id=auth.uid() and p_reason='missed'
      and v_call.created_at<now()-interval '40 seconds' then 'missed'
    when p_reason='failed' then 'failed'
    else 'ended' end;
  update public.connect_calls set status=v_state,ended_at=now() where id=p_call_id returning * into v_call;
  return v_call;
end;$function$
;
CREATE OR REPLACE FUNCTION public.connect_finish_owned_audio_call(p_call_id uuid, p_reason text, p_answer_sha256 text DEFAULT NULL::text)
 RETURNS connect_calls
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_call public.connect_calls;
begin
  if not public.connect_has_live_session() then raise exception 'Active session required';end if;
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if p_reason not in ('failed','hangup') or p_reason is null then raise exception 'Invalid finish reason'; end if;
  select * into v_call from public.connect_calls where id=p_call_id for update;
  if not found or auth.uid() not in (v_call.caller_id,v_call.callee_id) then
    raise exception 'Call unavailable';
  end if;
  if v_call.status not in ('ringing','active') then return v_call; end if;
  if v_call.status='active' and auth.uid()=v_call.callee_id and
    (p_answer_sha256 is null or v_call.answer->>'sdp' is null or
     p_answer_sha256 <> pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(v_call.answer->>'sdp','UTF8')),'hex')) then
    return v_call;
  end if;
  update public.connect_calls set status=case when p_reason='failed' then 'failed' else 'ended' end,ended_at=now() where id=p_call_id returning * into v_call;
  return v_call;
end $function$
;
CREATE OR REPLACE FUNCTION public.connect_delete_message(p_message_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE caller uuid;
begin
  if not public.connect_has_live_session() then raise exception 'Active session required';end if;
 caller := (SELECT auth.uid());
 IF caller IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='28000'; END IF;
 IF EXISTS (SELECT 1 FROM public.messages WHERE id=p_message_id AND sender_id<>caller) THEN
   RAISE EXCEPTION 'Only the sender can delete a message' USING ERRCODE='42501';
 END IF;
 DELETE FROM public.messages WHERE id=p_message_id AND sender_id=caller;
END $function$
;
commit;
notify pgrst,'reload schema';

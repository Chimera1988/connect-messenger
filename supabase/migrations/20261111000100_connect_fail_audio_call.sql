-- Additive RPC: a technical failure is never a user decline. No data migration.
-- An unclaimed callee device must not finish another device's active call.
begin;
create or replace function public.connect_finish_owned_audio_call(p_call_id uuid, p_reason text, p_answer_sha256 text default null)
returns public.connect_calls language plpgsql security definer set search_path = '' as $$
declare v_call public.connect_calls;
begin
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
end $$;
revoke all on function public.connect_finish_owned_audio_call(uuid,text,text) from public, anon;
grant execute on function public.connect_finish_owned_audio_call(uuid,text,text) to authenticated;

-- Exercise the exact installed body against a temporary store, never user rows.
do $test$
declare definition text; caller uuid:=gen_random_uuid(); callee uuid:=gen_random_uuid(); outsider uuid:=gen_random_uuid(); cid uuid:=gen_random_uuid(); got public.connect_calls; previous_sub text:=current_setting('request.jwt.claim.sub',true);
begin
  create temporary table connect_failure_test_calls (like public.connect_calls including defaults) on commit drop;
  definition:=pg_get_functiondef('public.connect_finish_owned_audio_call(uuid,text,text)'::regprocedure);
  definition:=replace(definition,'public.connect_finish_owned_audio_call(', 'pg_temp.connect_failure_test(');
  definition:=replace(definition,'from public.connect_calls','from pg_temp.connect_failure_test_calls');
  definition:=replace(definition,'update public.connect_calls','update pg_temp.connect_failure_test_calls');
  execute definition;
  insert into pg_temp.connect_failure_test_calls(id,conversation_id,caller_id,callee_id,status,offer,answer)
    values(cid,gen_random_uuid(),caller,callee,'ringing','{"type":"offer","sdp":"synthetic"}',null);
  perform set_config('request.jwt.claim.sub','',true);
  begin perform pg_temp.connect_failure_test(cid,'failed',null); raise exception 'anonymous accepted';
    exception when others then if sqlerrm<>'Not authenticated' then raise; end if; end;
  perform set_config('request.jwt.claim.sub',outsider::text,true);
  begin perform pg_temp.connect_failure_test(cid,'failed',null); raise exception 'outsider accepted';
    exception when others then if sqlerrm<>'Call unavailable' then raise; end if; end;
  perform set_config('request.jwt.claim.sub',callee::text,true);
  got:=pg_temp.connect_failure_test(cid,'failed',null); assert got.status='failed', 'technical failure is not decline';
  update pg_temp.connect_failure_test_calls set status='active',answer='{"type":"answer","sdp":"synthetic-answer"}' where id=cid;
  got:=pg_temp.connect_failure_test(cid,'failed',null); assert got.status='active', 'unclaimed device ended active call';
  got:=pg_temp.connect_failure_test(cid,'failed','wrong'); assert got.status='active', 'other device ended active call';
  got:=pg_temp.connect_failure_test(cid,'failed',encode(sha256(convert_to('synthetic-answer','UTF8')),'hex')); assert got.status='failed', 'owner failure not applied';
  got:=pg_temp.connect_failure_test(cid,'failed',null); assert got.status='failed', 'failure not idempotent';
  update pg_temp.connect_failure_test_calls set status='active' where id=cid;
  perform set_config('request.jwt.claim.sub',caller::text,true);
  got:=pg_temp.connect_failure_test(cid,'failed',null); assert got.status='failed', 'caller cannot finish failed call';
  update pg_temp.connect_failure_test_calls set status='declined' where id=cid;
  got:=pg_temp.connect_failure_test(cid,'failed',null); assert got.status='declined', 'terminal history overwritten';
  update pg_temp.connect_failure_test_calls set status='active' where id=cid;
  perform set_config('request.jwt.claim.sub',callee::text,true);
  got:=pg_temp.connect_failure_test(cid,'hangup',null); assert got.status='active', 'late cancel ended another device';
  got:=pg_temp.connect_failure_test(cid,'hangup',encode(sha256(convert_to('synthetic-answer','UTF8')),'hex')); assert got.status='ended', 'answer owner cannot end';
  begin perform pg_temp.connect_failure_test(cid,'decline',null); raise exception 'invalid reason accepted';
    exception when others then if sqlerrm<>'Invalid finish reason' then raise; end if; end;
  perform set_config('request.jwt.claim.sub',coalesce(previous_sub,''),true);
  drop function pg_temp.connect_failure_test(uuid,text,text);
end $test$;

notify pgrst, 'reload schema';
commit;
-- Rollback after clients stop using this RPC:
-- drop function public.connect_finish_owned_audio_call(uuid,text,text);
-- Existing failed history is retained; never rewrite user history on rollback.

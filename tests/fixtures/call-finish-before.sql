CREATE OR REPLACE FUNCTION public.connect_finish_audio_call(p_call_id uuid, p_reason text DEFAULT 'hangup'::text)
 RETURNS connect_calls
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_call public.connect_calls; v_state text;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  select * into v_call from public.connect_calls where id=p_call_id for update;
  if not found or auth.uid() not in(v_call.caller_id,v_call.callee_id) then
    raise exception 'Call unavailable';
  end if;
  if v_call.status not in('ringing','active') then return v_call; end if;
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

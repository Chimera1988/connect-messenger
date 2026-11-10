-- A late decline/busy from another device must not end an accepted call.
-- No call rows, accounts, RLS policies or RPC signatures are changed.
-- Existing privileges/security attributes are preserved by CREATE OR REPLACE.
DO $migration$
DECLARE
  definition text;
  anchor constant text := '  if v_call.status not in(''ringing'',''active'') then return v_call; end if;';
  guard constant text := E'\n  -- connect-call-response-owner-v1\n  if p_reason in (''decline'', ''busy'') and v_call.status <> ''ringing'' then return v_call; end if;';
BEGIN
  definition := pg_get_functiondef('public.connect_finish_audio_call(uuid,text)'::regprocedure);
  IF position('connect-call-response-owner-v1' in definition) > 0 THEN
    IF position(guard in definition) = 0 THEN RAISE EXCEPTION 'Call finish guard differs from expected version'; END IF;
    RETURN;
  END IF;
  IF position('security definer' in lower(definition)) = 0
     OR position('for update' in lower(definition)) = 0
     OR position('auth.uid() not in(v_call.caller_id,v_call.callee_id)' in definition) = 0
     OR (length(definition) - length(replace(definition, anchor, ''))) / length(anchor) <> 1 THEN
    RAISE EXCEPTION 'Incompatible connect_finish_audio_call: refusing to replace unknown implementation';
  END IF;
  EXECUTE replace(definition, anchor, anchor || guard);
END
$migration$;

-- Explicit operator rollback only; restores the earlier late-decline behaviour.
-- Refuse unknown edits rather than replacing an entire newer RPC definition.
DO $rollback$
DECLARE
  definition text;
  guard constant text := E'\n  -- connect-call-response-owner-v1\n  if p_reason in (''decline'', ''busy'') and v_call.status <> ''ringing'' then return v_call; end if;';
BEGIN
  definition := pg_get_functiondef('public.connect_finish_audio_call(uuid,text)'::regprocedure);
  IF position('connect-call-response-owner-v1' in definition) = 0 THEN RETURN; END IF;
  IF (length(definition)-length(replace(definition, guard, ''))) / length(guard) <> 1 THEN
    RAISE EXCEPTION 'Call finish guard has changed; manual review required';
  END IF;
  EXECUTE replace(definition, guard, '');
END
$rollback$;

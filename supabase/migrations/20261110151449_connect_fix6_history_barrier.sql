-- Additive FIX6 deletion journal. No message bodies/files are purged or rewritten.
-- Run transactionally; existing message validation, access rules and call RPCs stay in place.
DO $check$
BEGIN
  IF to_regclass('public.messages') IS NULL OR to_regclass('public.conversations') IS NULL
     OR to_regprocedure('private.connect_can_reach(uuid,uuid)') IS NULL THEN
    RAISE EXCEPTION 'Connect schema/visibility prerequisite missing';
  END IF;
END
$check$;

CREATE TABLE IF NOT EXISTS public.connect_message_tombstones(
  message_id uuid PRIMARY KEY,
  conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  deleted_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX IF NOT EXISTS connect_fix6_deleted_cursor ON public.connect_message_tombstones(deleted_at,message_id);
CREATE INDEX IF NOT EXISTS connect_fix6_deleted_chat ON public.connect_message_tombstones(conversation_id);
CREATE INDEX IF NOT EXISTS connect_fix6_message_page ON public.messages(conversation_id,created_at,id);
ALTER TABLE public.connect_message_tombstones ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.connect_message_tombstones FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.connect_message_tombstones TO authenticated;
GRANT ALL ON public.connect_message_tombstones TO service_role;
DO $policy$
BEGIN
  IF NOT EXISTS(SELECT 1 FROM pg_policy WHERE polrelid='public.connect_message_tombstones'::regclass AND polname='connect fix6 deleted participants') THEN
    CREATE POLICY "connect fix6 deleted participants" ON public.connect_message_tombstones FOR SELECT TO authenticated USING(
      EXISTS(SELECT 1 FROM public.conversations c WHERE c.id=conversation_id
        AND (SELECT auth.uid()) IN(c.user_a,c.user_b) AND private.connect_can_reach(c.user_a,c.user_b))
    );
  END IF;
  -- Existing permissive visibility policies are OR-ed, so they must never
  -- grant third parties access to the participants' call SDP/signaling rows.
  IF NOT EXISTS(SELECT 1 FROM pg_policy WHERE polrelid='public.connect_calls'::regclass AND polname='connect fix6 calls participant fence') THEN
    CREATE POLICY "connect fix6 calls participant fence" ON public.connect_calls AS RESTRICTIVE FOR SELECT TO authenticated
      USING((SELECT auth.uid()) IN(caller_id,callee_id) AND private.connect_can_reach(caller_id,callee_id));
  END IF;
END
$policy$;

CREATE OR REPLACE FUNCTION private.connect_fix6_deleted_event() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $function$
DECLARE v_id uuid;v_chat uuid;
BEGIN
  IF TG_OP='DELETE' THEN v_id:=OLD.id;v_chat:=OLD.conversation_id;
  ELSE
    IF NEW.deleted_at IS NULL THEN RETURN NEW;END IF;
    v_id:=NEW.id;v_chat:=NEW.conversation_id;
  END IF;
  -- A conversation cascade has already removed its parent; don't recreate it.
  IF EXISTS(SELECT 1 FROM public.conversations WHERE id=v_chat) THEN
    INSERT INTO public.connect_message_tombstones(message_id,conversation_id)
      VALUES(v_id,v_chat) ON CONFLICT(message_id) DO NOTHING;
  END IF;
  IF TG_OP='DELETE' THEN RETURN OLD;ELSE RETURN NEW;END IF;
END
$function$;
REVOKE ALL ON FUNCTION private.connect_fix6_deleted_event() FROM PUBLIC,anon,authenticated;
CREATE OR REPLACE FUNCTION private.connect_fix6_retired_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $function$
BEGIN
  IF EXISTS(SELECT 1 FROM public.connect_message_tombstones WHERE message_id=NEW.id) THEN
    RAISE EXCEPTION 'Message identity has been retired';
  END IF;
  RETURN NEW;
END
$function$;
REVOKE ALL ON FUNCTION private.connect_fix6_retired_guard() FROM PUBLIC,anon,authenticated;
DO $triggers$
BEGIN
  IF NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid='public.messages'::regclass AND tgname='connect_fix6_deleted_event') THEN
    CREATE TRIGGER connect_fix6_deleted_event AFTER INSERT OR UPDATE OF deleted_at OR DELETE ON public.messages FOR EACH ROW EXECUTE FUNCTION private.connect_fix6_deleted_event();
  END IF;
  IF NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid='public.messages'::regclass AND tgname='connect_fix6_retired_guard') THEN
    CREATE TRIGGER connect_fix6_retired_guard BEFORE INSERT ON public.messages FOR EACH ROW EXECUTE FUNCTION private.connect_fix6_retired_guard();
  END IF;
END
$triggers$;
-- Backfill metadata only. Server observation time makes newly installed
-- journaling visible to clients with an existing cursor; repeats don't move it.
INSERT INTO public.connect_message_tombstones(message_id,conversation_id)
 SELECT m.id,m.conversation_id FROM public.messages m WHERE m.deleted_at IS NOT NULL
 ON CONFLICT(message_id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.connect_deleted_since(
 p_after timestamptz DEFAULT '1970-01-01T00:00:00Z',
 p_id uuid DEFAULT '00000000-0000-0000-0000-000000000000',p_limit integer DEFAULT 200)
RETURNS TABLE(message_id uuid,conversation_id uuid,deleted_at timestamptz)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $function$
 SELECT t.message_id,t.conversation_id,t.deleted_at FROM public.connect_message_tombstones t
 WHERE (SELECT auth.uid()) IS NOT NULL AND (t.deleted_at,t.message_id)>(p_after,p_id)
 ORDER BY t.deleted_at,t.message_id LIMIT greatest(1,least(coalesce(p_limit,200),500));
$function$;
REVOKE ALL ON FUNCTION public.connect_deleted_since(timestamptz,uuid,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.connect_deleted_since(timestamptz,uuid,integer) TO authenticated;

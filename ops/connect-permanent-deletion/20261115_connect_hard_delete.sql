-- CONNECT: hard-delete message contents, retain only content-free synchronization tombstones.
-- Existing private.connect_fix6_deleted_event() AFTER DELETE trigger is intentionally preserved.
BEGIN;

CREATE TABLE IF NOT EXISTS public.connect_media_deletion_jobs (
  message_id uuid NOT NULL,
  sender_id uuid NOT NULL,
  conversation_id uuid NOT NULL,
  path text NOT NULL,
  queued_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (message_id, path)
);
ALTER TABLE public.connect_media_deletion_jobs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.connect_media_deletion_jobs FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.connect_media_deletion_jobs TO service_role;
CREATE INDEX IF NOT EXISTS connect_media_deletion_jobs_sender ON public.connect_media_deletion_jobs(sender_id,queued_at);

CREATE OR REPLACE FUNCTION private.connect_queue_removed_media() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $func$
DECLARE p text; entry text[];
BEGIN
  -- Only an actual database DELETE queues storage removal, not a soft-delete update.
  IF OLD.attachment_path IS NOT NULL AND length(OLD.attachment_path) BETWEEN 10 AND 900 THEN
    INSERT INTO public.connect_media_deletion_jobs(message_id,sender_id,conversation_id,path)
    VALUES (OLD.id, OLD.sender_id, OLD.conversation_id, OLD.attachment_path)
    ON CONFLICT DO NOTHING;
  END IF;
  -- Albums are encoded as JSON under [[connect-album:...]]. Forwarded album
  -- wrappers may also include this exact marker. Never scan arbitrary body JSON.
  IF position('[[connect-album:' IN OLD.body)>0 THEN
    FOR entry IN SELECT regexp_matches(OLD.body, '"path"[[:space:]]*:[[:space:]]*"([^"\\]+)"','g') LOOP
      p:=entry[1];
      IF length(p) BETWEEN 10 AND 900 AND
         p LIKE OLD.conversation_id::text || '/' || OLD.sender_id::text || '/%' THEN
        INSERT INTO public.connect_media_deletion_jobs(message_id,sender_id,conversation_id,path)
        VALUES (OLD.id,OLD.sender_id,OLD.conversation_id,p)
        ON CONFLICT DO NOTHING;
      END IF;
    END LOOP;
  END IF;
  RETURN OLD;
END $func$;
REVOKE ALL ON FUNCTION private.connect_queue_removed_media() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS connect_queue_removed_media ON public.messages;
CREATE TRIGGER connect_queue_removed_media AFTER DELETE ON public.messages
FOR EACH ROW EXECUTE FUNCTION private.connect_queue_removed_media();

-- PostgreSQL ON DELETE SET NULL for replies must be allowed to update reply_to,
-- otherwise the existing validator blocks physical deletion of replied-to messages.
-- Reject direct user edits to reply_to while the referenced message still exists.
CREATE OR REPLACE FUNCTION public.validate_message_changes() RETURNS trigger
LANGUAGE plpgsql SET search_path='' AS $func$
DECLARE fk_nullified boolean := false;
BEGIN
 IF tg_op='UPDATE' THEN
   fk_nullified := old.reply_to IS NOT NULL AND new.reply_to IS NULL
     AND NOT EXISTS(SELECT 1 FROM public.messages parent WHERE parent.id=old.reply_to);
   IF new.id IS DISTINCT FROM old.id
     OR new.conversation_id IS DISTINCT FROM old.conversation_id
     OR new.sender_id IS DISTINCT FROM old.sender_id
     OR new.created_at IS DISTINCT FROM old.created_at
     OR (new.reply_to IS DISTINCT FROM old.reply_to AND NOT fk_nullified) THEN
       RAISE EXCEPTION 'Message identity cannot be changed';
   END IF;
   IF old.deleted_at IS NOT NULL THEN
     IF fk_nullified AND (to_jsonb(new)-'reply_to')=(to_jsonb(old)-'reply_to') THEN
       RETURN new;
     END IF;
     RAISE EXCEPTION 'Deleted message cannot be changed';
   END IF;
   IF new.deleted_at IS NOT NULL THEN
     new.deleted_at=now(); new.body='';
   ELSIF new.body IS DISTINCT FROM old.body THEN
     new.edited_at=now();
   END IF;
 END IF;
 IF tg_op='INSERT' AND new.reply_to IS NOT NULL THEN
   IF NOT EXISTS(SELECT 1 FROM public.messages m WHERE m.id=new.reply_to AND m.conversation_id=new.conversation_id AND m.deleted_at IS NULL) THEN
     RAISE EXCEPTION 'Invalid reply target';
   END IF;
 END IF;
 RETURN new;
END $func$;

-- Legacy PWA/APK clients already attempt this RPC before a soft-delete fallback.
-- Ownership is enforced server-side, and DELETE triggers the existing tombstone.
GRANT DELETE ON TABLE public.messages TO authenticated;
DROP POLICY IF EXISTS "connect sender hard delete" ON public.messages;
CREATE POLICY "connect sender hard delete" ON public.messages
  FOR DELETE TO authenticated USING (sender_id=(SELECT auth.uid()));

CREATE OR REPLACE FUNCTION public.connect_delete_message(p_message_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $func$
DECLARE caller uuid;
BEGIN
 caller := (SELECT auth.uid());
 IF caller IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='28000'; END IF;
 IF EXISTS (SELECT 1 FROM public.messages WHERE id=p_message_id AND sender_id<>caller) THEN
   RAISE EXCEPTION 'Only the sender can delete a message' USING ERRCODE='42501';
 END IF;
 DELETE FROM public.messages WHERE id=p_message_id AND sender_id=caller;
END $func$;
REVOKE ALL ON FUNCTION public.connect_delete_message(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.connect_delete_message(uuid) TO authenticated;

COMMIT;
NOTIFY pgrst, 'reload schema';

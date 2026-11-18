-- Connect baseline, schema-only snapshot 2026-11-18. Never apply to an existing database.

-- Supabase managed auth/storage/vault/net/extensions schemas must already exist.

begin;

set local check_function_bodies=off;

create schema if not exists private;

revoke all on schema private from public,anon;

grant usage on schema private to authenticated,service_role;

create table "public"."conversations" (
  "id" uuid default gen_random_uuid() not null,
  "user_a" uuid not null,
  "user_b" uuid not null,
  "created_at" timestamp with time zone default now() not null
);

alter table "public"."conversations" enable row level security;

create table "public"."profiles" (
  "id" uuid not null,
  "display_name" text not null,
  "is_blocked" boolean default false not null,
  "created_at" timestamp with time zone default now() not null,
  "bio" text default ''::text not null,
  "avatar_path" text,
  "last_seen_at" timestamp with time zone,
  "online_until" timestamp with time zone
);

alter table "public"."profiles" enable row level security;

create table "public"."messages" (
  "id" uuid default gen_random_uuid() not null,
  "conversation_id" uuid not null,
  "sender_id" uuid not null,
  "body" text not null,
  "created_at" timestamp with time zone default now() not null,
  "edited_at" timestamp with time zone,
  "deleted_for_sender" boolean default false not null,
  "reply_to" uuid,
  "deleted_at" timestamp with time zone,
  "attachment_path" text,
  "attachment_name" text,
  "attachment_type" text,
  "attachment_size" bigint,
  "attachment_kind" text
);

alter table "public"."messages" enable row level security;

create table "public"."connect_sticker_packs" (
  "id" uuid default gen_random_uuid() not null,
  "owner_id" uuid not null,
  "name" text not null,
  "emoji" text default '🎨'::text not null,
  "is_public" boolean default false not null,
  "created_at" timestamp with time zone default now() not null
);

alter table "public"."connect_sticker_packs" enable row level security;

create table "public"."connect_stickers" (
  "id" uuid default gen_random_uuid() not null,
  "pack_id" uuid not null,
  "name" text not null,
  "storage_path" text not null,
  "position" integer default 0 not null,
  "created_at" timestamp with time zone default now() not null
);

alter table "public"."connect_stickers" enable row level security;

create table "public"."push_devices" (
  "id" uuid default gen_random_uuid() not null,
  "user_id" uuid not null,
  "platform" text not null,
  "endpoint" text not null,
  "subscription" jsonb,
  "created_at" timestamp with time zone default now() not null,
  "updated_at" timestamp with time zone default now() not null,
  "needs_push_refresh" boolean default false not null
);

alter table "public"."push_devices" enable row level security;

create table "public"."notification_preferences" (
  "user_id" uuid not null,
  "enabled" boolean default true not null,
  "sound" text default 'soft'::text not null,
  "vibrate" boolean default true not null,
  "updated_at" timestamp with time zone default now() not null
);

alter table "public"."notification_preferences" enable row level security;

create table "public"."conversation_user_state" (
  "conversation_id" uuid not null,
  "user_id" uuid not null,
  "last_read_at" timestamp with time zone default '1970-01-01 00:00:00+00'::timestamp with time zone not null,
  "typing_until" timestamp with time zone,
  "last_delivered_at" timestamp with time zone,
  "recording_until" timestamp with time zone,
  "activity_kind" text,
  "activity_until" timestamp with time zone
);

alter table "public"."conversation_user_state" enable row level security;

create table "public"."connect_calls" (
  "id" uuid default gen_random_uuid() not null,
  "conversation_id" uuid not null,
  "caller_id" uuid not null,
  "callee_id" uuid not null,
  "status" text default 'ringing'::text not null,
  "offer" jsonb not null,
  "answer" jsonb,
  "created_at" timestamp with time zone default now() not null,
  "answered_at" timestamp with time zone,
  "ended_at" timestamp with time zone
);

alter table "public"."connect_calls" enable row level security;

create table "public"."connect_call_ice" (
  "id" bigint generated always as identity not null,
  "call_id" uuid not null,
  "sender_id" uuid not null,
  "candidate" jsonb not null,
  "created_at" timestamp with time zone default now() not null
);

alter table "public"."connect_call_ice" enable row level security;

create table "public"."connect_orphan_storage_deletion_jobs" (
  "bucket_id" text not null,
  "path" text not null,
  "reason" text not null,
  "queued_at" timestamp with time zone default now() not null,
  "not_before" timestamp with time zone not null
);

alter table "public"."connect_orphan_storage_deletion_jobs" enable row level security;

create table "public"."connect_call_push_log" (
  "call_id" uuid not null,
  "created_at" timestamp with time zone default now() not null
);

alter table "public"."connect_call_push_log" enable row level security;

create table "public"."connect_call_journal_settings" (
  "owner_id" uuid not null,
  "cleared_before" timestamp with time zone,
  "hidden_ids" uuid[] default ARRAY[]::uuid[] not null,
  "updated_at" timestamp with time zone default now() not null
);

alter table "public"."connect_call_journal_settings" enable row level security;

create table "public"."connect_music_presence" (
  "owner_id" uuid not null,
  "is_public" boolean default false not null,
  "is_playing" boolean default false not null,
  "track_name" text default ''::text not null,
  "updated_at" timestamp with time zone default now() not null
);

alter table "public"."connect_music_presence" enable row level security;

create table "public"."connect_hidden_members" (
  "user_id" uuid not null,
  "admin_id" uuid not null,
  "created_at" timestamp with time zone default now() not null
);

alter table "public"."connect_hidden_members" enable row level security;

create table "public"."connect_invitation_codes" (
  "id" uuid default gen_random_uuid() not null,
  "code_hash" text not null,
  "email" text not null,
  "created_by" uuid not null,
  "created_at" timestamp with time zone default now() not null,
  "expires_at" timestamp with time zone default (now() + '24:00:00'::interval) not null,
  "redeemed_at" timestamp with time zone,
  "redeemed_by" uuid,
  "revoked_at" timestamp with time zone,
  "invite_type" text default 'normal'::text not null
);

alter table "public"."connect_invitation_codes" enable row level security;

create table "private"."connect_media_gc_auth" (
  "key" text not null,
  "token_sha256" text not null,
  "created_at" timestamp with time zone default now() not null
);

create table "public"."connect_message_tombstones" (
  "message_id" uuid not null,
  "conversation_id" uuid not null,
  "deleted_at" timestamp with time zone default clock_timestamp() not null
);

alter table "public"."connect_message_tombstones" enable row level security;

create table "public"."connect_media_deletion_jobs" (
  "message_id" uuid not null,
  "sender_id" uuid not null,
  "conversation_id" uuid not null,
  "path" text not null,
  "queued_at" timestamp with time zone default now() not null
);

alter table "public"."connect_media_deletion_jobs" enable row level security;

create table "public"."connect_sticker_deletion_jobs" (
  "path" text not null,
  "queued_at" timestamp with time zone default now() not null
);

alter table "public"."connect_sticker_deletion_jobs" enable row level security;

create table "public"."connect_account_file_deletion_jobs" (
  "bucket_id" text not null,
  "path" text not null,
  "account_id" uuid not null,
  "queued_at" timestamp with time zone default now() not null
);

alter table "public"."connect_account_file_deletion_jobs" enable row level security;

alter table public.connect_invitation_codes add constraint "connect_invitation_codes_pkey" PRIMARY KEY (id);

alter table public.profiles add constraint "profiles_pkey" PRIMARY KEY (id);

alter table public.conversations add constraint "conversations_pkey" PRIMARY KEY (id);

alter table public.messages add constraint "messages_pkey" PRIMARY KEY (id);

alter table public.conversation_user_state add constraint "conversation_user_state_pkey" PRIMARY KEY (conversation_id, user_id);

alter table public.push_devices add constraint "push_devices_pkey" PRIMARY KEY (id);

alter table public.notification_preferences add constraint "notification_preferences_pkey" PRIMARY KEY (user_id);

alter table public.connect_sticker_packs add constraint "connect_sticker_packs_pkey" PRIMARY KEY (id);

alter table public.connect_stickers add constraint "connect_stickers_pkey" PRIMARY KEY (id);

alter table public.connect_calls add constraint "connect_calls_pkey" PRIMARY KEY (id);

alter table public.connect_call_ice add constraint "connect_call_ice_pkey" PRIMARY KEY (id);

alter table public.connect_call_push_log add constraint "connect_call_push_log_pkey" PRIMARY KEY (call_id);

alter table public.connect_music_presence add constraint "connect_music_presence_pkey" PRIMARY KEY (owner_id);

alter table public.connect_call_journal_settings add constraint "connect_call_journal_settings_pkey" PRIMARY KEY (owner_id);

alter table public.connect_hidden_members add constraint "connect_hidden_members_pkey" PRIMARY KEY (user_id);

alter table public.connect_message_tombstones add constraint "connect_message_tombstones_pkey" PRIMARY KEY (message_id);

alter table public.connect_media_deletion_jobs add constraint "connect_media_deletion_jobs_pkey" PRIMARY KEY (message_id, path);

alter table private.connect_media_gc_auth add constraint "connect_media_gc_auth_pkey" PRIMARY KEY (key);

alter table public.connect_sticker_deletion_jobs add constraint "connect_sticker_deletion_jobs_pkey" PRIMARY KEY (path);

alter table public.connect_account_file_deletion_jobs add constraint "connect_account_file_deletion_jobs_pkey" PRIMARY KEY (bucket_id, path);

alter table public.connect_orphan_storage_deletion_jobs add constraint "connect_orphan_storage_deletion_jobs_pkey" PRIMARY KEY (bucket_id, path);

alter table public.conversations add constraint "conversations_user_a_user_b_key" UNIQUE (user_a, user_b);

alter table public.connect_invitation_codes add constraint "connect_invitation_codes_code_hash_key" UNIQUE (code_hash);

alter table public.push_devices add constraint "push_devices_user_id_endpoint_key" UNIQUE (user_id, endpoint);

alter table public.connect_stickers add constraint "connect_stickers_storage_path_key" UNIQUE (storage_path);

alter table public.profiles add constraint "profiles_display_name_check" CHECK (((char_length(display_name) >= 1) AND (char_length(display_name) <= 80)));

alter table public.conversations add constraint "different_users" CHECK ((user_a <> user_b));

alter table public.conversations add constraint "ordered_users" CHECK ((user_a < user_b));

alter table public.profiles add constraint "profiles_bio_length" CHECK ((char_length(bio) <= 160));

alter table public.profiles add constraint "profiles_name_length" CHECK (((char_length(display_name) >= 1) AND (char_length(display_name) <= 60)));

alter table public.messages add constraint "messages_attachment_valid" CHECK ((((attachment_path IS NULL) AND (attachment_name IS NULL) AND (attachment_type IS NULL) AND (attachment_size IS NULL) AND (attachment_kind IS NULL)) OR ((attachment_path IS NOT NULL) AND (attachment_name IS NOT NULL) AND (attachment_type IS NOT NULL) AND ((attachment_size >= 1) AND (attachment_size <= 104857600)) AND (attachment_kind = ANY (ARRAY['image'::text, 'video'::text, 'file'::text, 'audio'::text])) AND (attachment_path ~~ ((((conversation_id)::text || '/'::text) || (sender_id)::text) || '/%'::text)))));

alter table public.push_devices add constraint "push_devices_platform_check" CHECK ((platform = ANY (ARRAY['web'::text, 'android'::text])));

alter table public.notification_preferences add constraint "notification_sound_check" CHECK ((sound = ANY (ARRAY['soft'::text, 'bright'::text, 'gentle'::text, 'silent'::text])));

alter table public.messages add constraint "messages_body_check" CHECK (((char_length(body) <= 10000) AND ((char_length(body) >= 1) OR (deleted_at IS NOT NULL) OR (attachment_path IS NOT NULL))));

alter table public.connect_sticker_packs add constraint "connect_sticker_packs_name_check" CHECK (((char_length(name) >= 1) AND (char_length(name) <= 60)));

alter table public.connect_stickers add constraint "connect_stickers_name_check" CHECK (((char_length(name) >= 1) AND (char_length(name) <= 60)));

alter table public.connect_calls add constraint "connect_calls_status_check" CHECK ((status = ANY (ARRAY['ringing'::text, 'active'::text, 'ended'::text, 'declined'::text, 'missed'::text, 'busy'::text, 'failed'::text])));

alter table public.connect_calls add constraint "connect_calls_two_people" CHECK ((caller_id <> callee_id));

alter table public.connect_call_ice add constraint "connect_call_candidate_length" CHECK ((octet_length((candidate)::text) <= 8192));

alter table public.connect_invitation_codes add constraint "connect_invite_type_allowed" CHECK ((invite_type = ANY (ARRAY['normal'::text, 'hidden'::text])));

alter table public.connect_hidden_members add constraint "connect_hidden_member_is_not_admin" CHECK ((user_id <> admin_id));

alter table private.connect_media_gc_auth add constraint "connect_media_gc_auth_key_check" CHECK ((key = 'daily'::text));

alter table private.connect_media_gc_auth add constraint "connect_media_gc_auth_token_sha256_check" CHECK ((length(token_sha256) = 64));

alter table public.connect_sticker_deletion_jobs add constraint "sticker_gc_path_length" CHECK (((char_length(path) >= 10) AND (char_length(path) <= 900)));

alter table public.conversation_user_state add constraint "connect_user_state_activity_kind_valid" CHECK (((activity_kind IS NULL) OR (activity_kind = ANY (ARRAY['typing'::text, 'voice'::text, 'video'::text, 'sticker'::text, 'file'::text]))));

alter table public.connect_account_file_deletion_jobs add constraint "connect_account_file_deletion_jobs_bucket_id_check" CHECK ((bucket_id = ANY (ARRAY['connect-attachments'::text, 'connect-avatars'::text, 'connect-profile-media'::text, 'connect-stickers'::text])));

alter table public.connect_account_file_deletion_jobs add constraint "connect_account_file_deletion_jobs_path_check" CHECK (((char_length(path) >= 1) AND (char_length(path) <= 900)));

alter table public.connect_orphan_storage_deletion_jobs add constraint "connect_orphan_storage_deletion_jobs_bucket_id_check" CHECK ((bucket_id = ANY (ARRAY['connect-avatars'::text, 'connect-attachments'::text])));

alter table public.connect_orphan_storage_deletion_jobs add constraint "connect_orphan_storage_deletion_jobs_path_check" CHECK (((char_length(path) >= 10) AND (char_length(path) <= 900)));

alter table public.connect_orphan_storage_deletion_jobs add constraint "connect_orphan_storage_deletion_jobs_reason_check" CHECK ((reason = ANY (ARRAY['avatar_replaced'::text, 'orphan_scan'::text])));

alter table public.conversations add constraint "conversations_user_a_fkey" FOREIGN KEY (user_a) REFERENCES profiles(id);

alter table public.conversations add constraint "conversations_user_b_fkey" FOREIGN KEY (user_b) REFERENCES profiles(id);

alter table public.messages add constraint "messages_conversation_id_fkey" FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE;

alter table public.messages add constraint "messages_sender_id_fkey" FOREIGN KEY (sender_id) REFERENCES profiles(id);

alter table public.conversation_user_state add constraint "conversation_user_state_conversation_id_fkey" FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE;

alter table public.conversation_user_state add constraint "conversation_user_state_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

alter table public.messages add constraint "messages_reply_to_fkey" FOREIGN KEY (reply_to) REFERENCES messages(id) ON DELETE SET NULL;

alter table public.push_devices add constraint "push_devices_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

alter table public.notification_preferences add constraint "notification_preferences_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

alter table public.connect_sticker_packs add constraint "connect_sticker_packs_owner_id_fkey" FOREIGN KEY (owner_id) REFERENCES auth.users(id) ON DELETE CASCADE;

alter table public.connect_stickers add constraint "connect_stickers_pack_id_fkey" FOREIGN KEY (pack_id) REFERENCES connect_sticker_packs(id) ON DELETE CASCADE;

alter table public.connect_calls add constraint "connect_calls_conversation_id_fkey" FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE;

alter table public.connect_calls add constraint "connect_calls_caller_id_fkey" FOREIGN KEY (caller_id) REFERENCES auth.users(id) ON DELETE CASCADE;

alter table public.connect_calls add constraint "connect_calls_callee_id_fkey" FOREIGN KEY (callee_id) REFERENCES auth.users(id) ON DELETE CASCADE;

alter table public.connect_call_ice add constraint "connect_call_ice_call_id_fkey" FOREIGN KEY (call_id) REFERENCES connect_calls(id) ON DELETE CASCADE;

alter table public.connect_call_ice add constraint "connect_call_ice_sender_id_fkey" FOREIGN KEY (sender_id) REFERENCES auth.users(id) ON DELETE CASCADE;

alter table public.connect_call_push_log add constraint "connect_call_push_log_call_id_fkey" FOREIGN KEY (call_id) REFERENCES connect_calls(id) ON DELETE CASCADE;

alter table public.connect_music_presence add constraint "connect_music_presence_owner_id_fkey" FOREIGN KEY (owner_id) REFERENCES profiles(id) ON DELETE CASCADE;

alter table public.connect_call_journal_settings add constraint "connect_call_journal_settings_owner_id_fkey" FOREIGN KEY (owner_id) REFERENCES profiles(id) ON DELETE CASCADE;

alter table public.connect_hidden_members add constraint "connect_hidden_members_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

alter table public.connect_hidden_members add constraint "connect_hidden_members_admin_id_fkey" FOREIGN KEY (admin_id) REFERENCES auth.users(id);

alter table public.connect_message_tombstones add constraint "connect_message_tombstones_conversation_id_fkey" FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE;

CREATE OR REPLACE FUNCTION private.can_view_profile(p_profile_id uuid, p_viewer_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$ select exists (select 1 from public.conversations c where (c.user_a = p_profile_id or c.user_b = p_profile_id) and (c.user_a = p_viewer_id or c.user_b = p_viewer_id)) $function$
;

revoke all on function "private"."can_view_profile"(p_profile_id uuid, p_viewer_id uuid) from public,anon,authenticated;

grant execute on function "private"."can_view_profile"(p_profile_id uuid, p_viewer_id uuid) to service_role;

grant execute on function "private"."can_view_profile"(p_profile_id uuid, p_viewer_id uuid) to "authenticated";

CREATE OR REPLACE FUNCTION private.connect_can_reach(p_first uuid, p_second uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select p_first is not null and p_second is not null and (
    p_first = p_second
    or (
      not exists(select 1 from public.connect_hidden_members h where h.user_id = p_first)
      and not exists(select 1 from public.connect_hidden_members h where h.user_id = p_second)
    )
    or exists(select 1 from public.connect_hidden_members h
              where h.user_id = p_first and h.admin_id = p_second)
    or exists(select 1 from public.connect_hidden_members h
              where h.user_id = p_second and h.admin_id = p_first)
  );
$function$
;

revoke all on function "private"."connect_can_reach"(p_first uuid, p_second uuid) from public,anon,authenticated;

grant execute on function "private"."connect_can_reach"(p_first uuid, p_second uuid) to service_role;

grant execute on function "private"."connect_can_reach"(p_first uuid, p_second uuid) to "authenticated";

CREATE OR REPLACE FUNCTION private.connect_fix6_deleted_event()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
$function$
;

revoke all on function "private"."connect_fix6_deleted_event"() from public,anon,authenticated;

grant execute on function "private"."connect_fix6_deleted_event"() to service_role;

CREATE OR REPLACE FUNCTION private.connect_fix6_retired_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  IF EXISTS(SELECT 1 FROM public.connect_message_tombstones WHERE message_id=NEW.id) THEN
    RAISE EXCEPTION 'Message identity has been retired';
  END IF;
  RETURN NEW;
END
$function$
;

revoke all on function "private"."connect_fix6_retired_guard"() from public,anon,authenticated;

grant execute on function "private"."connect_fix6_retired_guard"() to service_role;

CREATE OR REPLACE FUNCTION private.connect_guard_audio_call()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if TG_OP = 'INSERT' then
    if not private.connect_can_reach(new.caller_id,new.callee_id) then
      raise exception 'Call unavailable';
    end if;
  elsif TG_OP = 'UPDATE' and new.status = 'active' and old.status is distinct from 'active' then
    if not private.connect_can_reach(new.caller_id,new.callee_id) then
      raise exception 'Call unavailable';
    end if;
  end if;
  return new;
end $function$
;

revoke all on function "private"."connect_guard_audio_call"() from public,anon,authenticated;

grant execute on function "private"."connect_guard_audio_call"() to service_role;

CREATE OR REPLACE FUNCTION private.connect_purge_account_data(p_user_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  IF p_user_id IS NULL THEN RAISE EXCEPTION 'Account id required'; END IF;

  -- Record actual Storage files before removing database references.
  -- The worker later deletes the bytes via the Storage API, not SQL.
  INSERT INTO public.connect_account_file_deletion_jobs(bucket_id,path,account_id)
  SELECT o.bucket_id,o.name,p_user_id
  FROM storage.objects AS o
  WHERE o.bucket_id IN ('connect-attachments','connect-avatars','connect-profile-media','connect-stickers')
    AND char_length(o.name) BETWEEN 1 AND 900
    AND (
      o.owner_id = p_user_id::text
      OR (o.bucket_id = 'connect-attachments' AND split_part(o.name,'/',2) = p_user_id::text)
      OR (o.bucket_id IN ('connect-avatars','connect-profile-media','connect-stickers')
          AND split_part(o.name,'/',1) = p_user_id::text)
    )
  ON CONFLICT (bucket_id,path) DO NOTHING;

  -- Chats are two-party objects in the present Connect schema.
  -- Removing a participant requires removing the whole conversation.
  -- Messages and call/attachment events cascade through existing triggers.
  DELETE FROM public.conversations
  WHERE user_a = p_user_id OR user_b = p_user_id;

  DELETE FROM public.messages WHERE sender_id = p_user_id;
  DELETE FROM public.connect_calls WHERE caller_id = p_user_id OR callee_id = p_user_id;
  DELETE FROM public.connect_call_ice WHERE sender_id = p_user_id;
  DELETE FROM public.connect_sticker_packs WHERE owner_id = p_user_id;
  DELETE FROM public.connect_hidden_members WHERE user_id = p_user_id OR admin_id = p_user_id;
  DELETE FROM public.connect_invitation_codes
  WHERE created_by = p_user_id OR redeemed_by = p_user_id;
  DELETE FROM public.conversation_user_state WHERE user_id = p_user_id;
  DELETE FROM public.push_devices WHERE user_id = p_user_id;
  DELETE FROM public.notification_preferences WHERE user_id = p_user_id;
  DELETE FROM public.connect_music_presence WHERE owner_id = p_user_id;
  DELETE FROM public.connect_call_journal_settings WHERE owner_id = p_user_id;

  DELETE FROM public.profiles WHERE id = p_user_id;
END
$function$
;

revoke all on function "private"."connect_purge_account_data"(p_user_id uuid) from public,anon,authenticated;

grant execute on function "private"."connect_purge_account_data"(p_user_id uuid) to service_role;

CREATE OR REPLACE FUNCTION private.connect_purge_on_auth_delete()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  PERFORM private.connect_purge_account_data(OLD.id);
  RETURN OLD;
END
$function$
;

revoke all on function "private"."connect_purge_on_auth_delete"() from public,anon,authenticated;

grant execute on function "private"."connect_purge_on_auth_delete"() to service_role;

CREATE OR REPLACE FUNCTION private.connect_queue_deleted_sticker_asset()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  IF (TG_OP = 'DELETE' OR OLD.storage_path IS DISTINCT FROM NEW.storage_path)
    AND OLD.storage_path IS NOT NULL
    AND char_length(OLD.storage_path) BETWEEN 10 AND 900
  THEN
    INSERT INTO public.connect_sticker_deletion_jobs(path)
    VALUES(OLD.storage_path)
    ON CONFLICT (path) DO NOTHING;
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END
$function$
;

revoke all on function "private"."connect_queue_deleted_sticker_asset"() from public,anon,authenticated;

grant execute on function "private"."connect_queue_deleted_sticker_asset"() to service_role;

CREATE OR REPLACE FUNCTION private.connect_queue_removed_media()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE p text; entry text[];
BEGIN
  IF OLD.attachment_path IS NOT NULL AND length(OLD.attachment_path) BETWEEN 10 AND 900 THEN
    INSERT INTO public.connect_media_deletion_jobs(message_id,sender_id,conversation_id,path)
    VALUES (OLD.id,OLD.sender_id,OLD.conversation_id,OLD.attachment_path)
    ON CONFLICT DO NOTHING;
  END IF;
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
END $function$
;

revoke all on function "private"."connect_queue_removed_media"() from public,anon,authenticated;

grant execute on function "private"."connect_queue_removed_media"() to service_role;

CREATE OR REPLACE FUNCTION private.connect_queue_replaced_avatar()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  IF OLD.avatar_path IS DISTINCT FROM NEW.avatar_path THEN
    IF NEW.avatar_path IS NOT NULL THEN
      DELETE FROM public.connect_orphan_storage_deletion_jobs
      WHERE bucket_id='connect-avatars' AND path=NEW.avatar_path;
    END IF;
    IF OLD.avatar_path IS NOT NULL
       AND char_length(OLD.avatar_path) BETWEEN 10 AND 900
       AND starts_with(OLD.avatar_path, OLD.id::text || '/') THEN
      INSERT INTO public.connect_orphan_storage_deletion_jobs
          (bucket_id,path,reason,not_before)
      SELECT 'connect-avatars',o.name,'avatar_replaced',
             greatest(pg_catalog.now()+interval '24 hours',o.updated_at+interval '24 hours')
      FROM storage.objects o
      WHERE o.bucket_id='connect-avatars' AND o.name=OLD.avatar_path
        AND o.owner_id=OLD.id::text
      ON CONFLICT(bucket_id,path) DO NOTHING;
    END IF;
  END IF;
  RETURN NEW;
END
$function$
;

revoke all on function "private"."connect_queue_replaced_avatar"() from public,anon,authenticated;

grant execute on function "private"."connect_queue_replaced_avatar"() to service_role;

CREATE OR REPLACE FUNCTION private.connect_scan_orphan_storage()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_avatar_count integer := 0;
  v_attachment_count integer := 0;
BEGIN
  INSERT INTO public.connect_orphan_storage_deletion_jobs(bucket_id,path,reason,not_before)
  SELECT o.bucket_id,o.name,'orphan_scan',
         greatest(o.updated_at+interval '24 hours',pg_catalog.now())
  FROM storage.objects o
  WHERE o.bucket_id='connect-avatars'
    AND o.created_at < pg_catalog.now()-interval '24 hours'
    AND o.updated_at < pg_catalog.now()-interval '24 hours'
    AND char_length(o.name) BETWEEN 10 AND 900
    AND o.owner_id IS NOT NULL
    AND starts_with(o.name,o.owner_id || '/')
    AND public.connect_media_gc_is_unreferenced(o.name)
  ON CONFLICT(bucket_id,path) DO NOTHING;
  GET DIAGNOSTICS v_avatar_count=ROW_COUNT;

  INSERT INTO public.connect_orphan_storage_deletion_jobs(bucket_id,path,reason,not_before)
  SELECT o.bucket_id,o.name,'orphan_scan',
         greatest(o.updated_at+interval '24 hours',pg_catalog.now())
  FROM storage.objects o
  WHERE o.bucket_id='connect-attachments'
    AND o.created_at < pg_catalog.now()-interval '24 hours'
    AND o.updated_at < pg_catalog.now()-interval '24 hours'
    AND char_length(o.name) BETWEEN 10 AND 900
    AND o.name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/[^/]+$'
    AND (o.owner_id IS NULL OR o.owner_id=split_part(o.name,'/',2))
    AND public.connect_media_gc_is_unreferenced(o.name)
  ON CONFLICT(bucket_id,path) DO NOTHING;
  GET DIAGNOSTICS v_attachment_count=ROW_COUNT;
  RETURN pg_catalog.jsonb_build_object('queued_avatars',v_avatar_count,'queued_attachments',v_attachment_count);
END
$function$
;

revoke all on function "private"."connect_scan_orphan_storage"() from public,anon,authenticated;

grant execute on function "private"."connect_scan_orphan_storage"() to service_role;

CREATE OR REPLACE FUNCTION private.connect_sent_sticker_pack_visible(p_pack_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 SELECT (SELECT auth.uid()) IS NOT NULL AND EXISTS (
   SELECT 1
   FROM public.connect_stickers s
   WHERE s.pack_id = p_pack_id
     AND private.connect_sent_sticker_visible(s.id)
 );
$function$
;

revoke all on function "private"."connect_sent_sticker_pack_visible"(p_pack_id uuid) from public,anon,authenticated;

grant execute on function "private"."connect_sent_sticker_pack_visible"(p_pack_id uuid) to service_role;

grant execute on function "private"."connect_sent_sticker_pack_visible"(p_pack_id uuid) to "authenticated";

CREATE OR REPLACE FUNCTION private.connect_sent_sticker_path_visible(p_path text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 SELECT (SELECT auth.uid()) IS NOT NULL
   AND p_path IS NOT NULL
   AND EXISTS (
     SELECT 1
     FROM public.connect_stickers s
     WHERE s.storage_path = p_path
       AND private.connect_sent_sticker_visible(s.id)
   );
$function$
;

revoke all on function "private"."connect_sent_sticker_path_visible"(p_path text) from public,anon,authenticated;

grant execute on function "private"."connect_sent_sticker_path_visible"(p_path text) to service_role;

grant execute on function "private"."connect_sent_sticker_path_visible"(p_path text) to "authenticated";

CREATE OR REPLACE FUNCTION private.connect_sent_sticker_visible(p_sticker_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 SELECT (SELECT auth.uid()) IS NOT NULL
    AND EXISTS (
       SELECT 1
       FROM public.connect_stickers s
       JOIN public.connect_sticker_packs p ON p.id = s.pack_id
       JOIN public.messages m
         ON m.body = ('[[connect-custom-sticker:' || s.id::text || ']]')
       JOIN public.conversations c ON c.id = m.conversation_id
       WHERE s.id = p_sticker_id
         AND m.deleted_at IS NULL
         AND m.sender_id = p.owner_id
         AND ((SELECT auth.uid()) = c.user_a OR (SELECT auth.uid()) = c.user_b)
    );
$function$
;

revoke all on function "private"."connect_sent_sticker_visible"(p_sticker_id uuid) from public,anon,authenticated;

grant execute on function "private"."connect_sent_sticker_visible"(p_sticker_id uuid) to service_role;

grant execute on function "private"."connect_sent_sticker_visible"(p_sticker_id uuid) to "authenticated";

CREATE OR REPLACE FUNCTION public.connect_account_file_gc_is_safe(p_bucket text, p_path text, p_account uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
SELECT
  p_account IS NOT NULL
  AND p_bucket IN ('connect-attachments','connect-avatars','connect-profile-media','connect-stickers')
  AND p_path IS NOT NULL
  AND char_length(p_path) BETWEEN 1 AND 900
  AND position('/../' in p_path) = 0
  AND EXISTS (
    SELECT 1 FROM public.connect_account_file_deletion_jobs j
    WHERE j.bucket_id = p_bucket AND j.path = p_path AND j.account_id = p_account
  )
  AND NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = p_account)
  AND NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = p_account)
  AND public.connect_media_gc_is_unreferenced(p_path)
  AND (
    NOT EXISTS (SELECT 1 FROM storage.objects o WHERE o.bucket_id=p_bucket AND o.name=p_path)
    OR EXISTS (
      SELECT 1 FROM storage.objects o
      WHERE o.bucket_id=p_bucket AND o.name=p_path
        AND (
          o.owner_id=p_account::text
          OR (o.owner_id IS NULL AND
             ((p_bucket='connect-attachments' AND split_part(o.name,'/',2)=p_account::text)
              OR (p_bucket IN ('connect-avatars','connect-profile-media','connect-stickers')
                  AND split_part(o.name,'/',1)=p_account::text)))
        )
    )
  );
$function$
;

revoke all on function "public"."connect_account_file_gc_is_safe"(p_bucket text, p_path text, p_account uuid) from public,anon,authenticated;

grant execute on function "public"."connect_account_file_gc_is_safe"(p_bucket text, p_path text, p_account uuid) to service_role;

CREATE OR REPLACE FUNCTION public.connect_admin_usage_snapshot(p_user_id uuid, p_session_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE result jsonb;
BEGIN
  IF p_user_id IS NULL OR p_session_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM auth.sessions AS s WHERE s.id = p_session_id AND s.user_id = p_user_id
  ) THEN
    RAISE EXCEPTION 'Inactive session' USING ERRCODE = '28000';
  END IF;
  WITH object_sizes AS (
    SELECT o.bucket_id,o.created_at,
      CASE WHEN (o.metadata->>'size') ~ '^[0-9]{1,18}$'
      THEN (o.metadata->>'size')::bigint ELSE 0::bigint END AS bytes
    FROM storage.objects AS o
  ), per_bucket AS (
    SELECT bucket_id,count(*)::bigint AS files,
      coalesce(sum(bytes),0)::bigint AS bytes,
      coalesce(sum(bytes) FILTER (WHERE created_at >= date_trunc('month',now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'),0)::bigint AS month_bytes
    FROM object_sizes GROUP BY bucket_id
  )
  SELECT jsonb_build_object(
    'databaseBytes', pg_database_size(current_database()),
    'storageBytes', coalesce(sum(bytes),0),
    'storageFiles', coalesce(sum(files),0),
    'monthStoredBytes', coalesce(sum(month_bytes),0),
    'buckets', coalesce(jsonb_agg(jsonb_build_object(
      'id',bucket_id,'bytes',bytes,'files',files,'monthBytes',month_bytes
    ) ORDER BY bucket_id),'[]'::jsonb)
  ) INTO result FROM per_bucket;
  RETURN result;
END
$function$
;

revoke all on function "public"."connect_admin_usage_snapshot"(p_user_id uuid, p_session_id uuid) from public,anon,authenticated;

grant execute on function "public"."connect_admin_usage_snapshot"(p_user_id uuid, p_session_id uuid) to service_role;

CREATE OR REPLACE FUNCTION public.connect_answer_audio_call(p_call_id uuid, p_answer jsonb)
 RETURNS connect_calls
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_result public.connect_calls;
begin
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

revoke all on function "public"."connect_answer_audio_call"(p_call_id uuid, p_answer jsonb) from public,anon,authenticated;

grant execute on function "public"."connect_answer_audio_call"(p_call_id uuid, p_answer jsonb) to service_role;

grant execute on function "public"."connect_answer_audio_call"(p_call_id uuid, p_answer jsonb) to "authenticated";

CREATE OR REPLACE FUNCTION public.connect_auth_session_active(p_user_id uuid, p_session_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
 SELECT p_user_id IS NOT NULL AND p_session_id IS NOT NULL AND EXISTS (
  SELECT 1 FROM auth.sessions s
  WHERE s.user_id=p_user_id AND s.id=p_session_id
  AND (s.not_after IS NULL OR s.not_after > now())
 );
$function$
;

revoke all on function "public"."connect_auth_session_active"(p_user_id uuid, p_session_id uuid) from public,anon,authenticated;

grant execute on function "public"."connect_auth_session_active"(p_user_id uuid, p_session_id uuid) to service_role;

CREATE OR REPLACE FUNCTION public.connect_delete_message(p_message_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE caller uuid;
BEGIN
 caller := (SELECT auth.uid());
 IF caller IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='28000'; END IF;
 IF EXISTS (SELECT 1 FROM public.messages WHERE id=p_message_id AND sender_id<>caller) THEN
   RAISE EXCEPTION 'Only the sender can delete a message' USING ERRCODE='42501';
 END IF;
 DELETE FROM public.messages WHERE id=p_message_id AND sender_id=caller;
END $function$
;

revoke all on function "public"."connect_delete_message"(p_message_id uuid) from public,anon,authenticated;

grant execute on function "public"."connect_delete_message"(p_message_id uuid) to service_role;

grant execute on function "public"."connect_delete_message"(p_message_id uuid) to "authenticated";

CREATE OR REPLACE FUNCTION public.connect_deleted_since(p_after timestamp with time zone DEFAULT '1970-01-01 00:00:00+00'::timestamp with time zone, p_id uuid DEFAULT '00000000-0000-0000-0000-000000000000'::uuid, p_limit integer DEFAULT 200)
 RETURNS TABLE(message_id uuid, conversation_id uuid, deleted_at timestamp with time zone)
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
 SELECT t.message_id,t.conversation_id,t.deleted_at FROM public.connect_message_tombstones t
 WHERE (SELECT auth.uid()) IS NOT NULL AND (t.deleted_at,t.message_id)>(p_after,p_id)
 ORDER BY t.deleted_at,t.message_id LIMIT greatest(1,least(coalesce(p_limit,200),500));
$function$
;

revoke all on function "public"."connect_deleted_since"(p_after timestamp with time zone, p_id uuid, p_limit integer) from public,anon,authenticated;

grant execute on function "public"."connect_deleted_since"(p_after timestamp with time zone, p_id uuid, p_limit integer) to service_role;

grant execute on function "public"."connect_deleted_since"(p_after timestamp with time zone, p_id uuid, p_limit integer) to "authenticated";

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

revoke all on function "public"."connect_finish_audio_call"(p_call_id uuid, p_reason text) from public,anon,authenticated;

grant execute on function "public"."connect_finish_audio_call"(p_call_id uuid, p_reason text) to service_role;

grant execute on function "public"."connect_finish_audio_call"(p_call_id uuid, p_reason text) to "authenticated";

CREATE OR REPLACE FUNCTION public.connect_finish_owned_audio_call(p_call_id uuid, p_reason text, p_answer_sha256 text DEFAULT NULL::text)
 RETURNS connect_calls
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
end $function$
;

revoke all on function "public"."connect_finish_owned_audio_call"(p_call_id uuid, p_reason text, p_answer_sha256 text) from public,anon,authenticated;

grant execute on function "public"."connect_finish_owned_audio_call"(p_call_id uuid, p_reason text, p_answer_sha256 text) to service_role;

grant execute on function "public"."connect_finish_owned_audio_call"(p_call_id uuid, p_reason text, p_answer_sha256 text) to "authenticated";

CREATE OR REPLACE FUNCTION public.connect_has_live_session()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM auth.sessions s
    WHERE s.id::text = (auth.jwt() ->> 'session_id')
      AND s.user_id = auth.uid()
  );
$function$
;

revoke all on function "public"."connect_has_live_session"() from public,anon,authenticated;

grant execute on function "public"."connect_has_live_session"() to service_role;

grant execute on function "public"."connect_has_live_session"() to "authenticated";

CREATE OR REPLACE FUNCTION public.connect_media_gc_authorized(p_token text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 SELECT EXISTS (
   SELECT 1
   FROM private.connect_media_gc_auth AS auth
   WHERE auth.key = 'daily'
     AND length(p_token) = 64
     AND auth.token_sha256 = encode(extensions.digest(p_token,'sha256'),'hex')
 );
$function$
;

revoke all on function "public"."connect_media_gc_authorized"(p_token text) from public,anon,authenticated;

grant execute on function "public"."connect_media_gc_authorized"(p_token text) to service_role;

CREATE OR REPLACE FUNCTION public.connect_media_gc_is_unreferenced(p_path text)
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
SELECT p_path IS NOT NULL AND char_length(p_path) BETWEEN 10 AND 900
  AND NOT EXISTS(
    SELECT 1 FROM public.messages m
    WHERE m.deleted_at IS NULL AND (
      m.attachment_path = p_path
      OR (m.attachment_path IS NOT NULL AND starts_with(p_path, m.attachment_path || '__'))
      OR position(p_path IN coalesce(m.body,'')) > 0
    )
  )
  AND NOT EXISTS(SELECT 1 FROM public.profiles p WHERE p.avatar_path=p_path)
  AND NOT EXISTS(SELECT 1 FROM public.connect_stickers s WHERE s.storage_path=p_path);
$function$
;

revoke all on function "public"."connect_media_gc_is_unreferenced"(p_path text) from public,anon,authenticated;

grant execute on function "public"."connect_media_gc_is_unreferenced"(p_path text) to service_role;

CREATE OR REPLACE FUNCTION public.connect_message_push_notify()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare s text;
begin
 select decrypted_secret into s from vault.decrypted_secrets where name='connect_push_webhook_secret' order by created_at desc limit 1;
 if s is null then raise warning 'Connect push secret not configured'; return new; end if;
 perform net.http_post(url:='https://connect-messenger-mu.vercel.app/api/push/message',headers:=jsonb_build_object('Content-Type','application/json','x-connect-webhook-secret',s),body:=jsonb_build_object('type','INSERT','table','messages','schema','public','record',jsonb_build_object('id',new.id,'conversation_id',new.conversation_id,'sender_id',new.sender_id)),timeout_milliseconds:=5000);
 return new;
end $function$
;

revoke all on function "public"."connect_message_push_notify"() from public,anon,authenticated;

grant execute on function "public"."connect_message_push_notify"() to service_role;

CREATE OR REPLACE FUNCTION public.connect_orphan_storage_gc_candidates(p_limit integer DEFAULT 100)
 RETURNS TABLE(bucket_id text, path text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
SELECT j.bucket_id,j.path
FROM public.connect_orphan_storage_deletion_jobs j
JOIN storage.objects o ON o.bucket_id=j.bucket_id AND o.name=j.path
WHERE j.not_before <= pg_catalog.now()
  AND o.created_at < pg_catalog.now()-interval '24 hours'
  AND o.updated_at < pg_catalog.now()-interval '24 hours'
  AND char_length(j.path) BETWEEN 10 AND 900
  AND position('/../' IN j.path)=0
  AND public.connect_media_gc_is_unreferenced(j.path)
  AND (
    (j.bucket_id='connect-avatars'
       AND o.owner_id IS NOT NULL
       AND starts_with(o.name,o.owner_id || '/'))
    OR
    (j.bucket_id='connect-attachments'
       AND j.path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/[^/]+$'
       AND (o.owner_id IS NULL OR o.owner_id=split_part(o.name,'/',2)))
  )
ORDER BY j.queued_at, j.bucket_id, j.path
LIMIT least(greatest(coalesce(p_limit,100),1),200);
$function$
;

revoke all on function "public"."connect_orphan_storage_gc_candidates"(p_limit integer) from public,anon,authenticated;

grant execute on function "public"."connect_orphan_storage_gc_candidates"(p_limit integer) to service_role;

CREATE OR REPLACE FUNCTION public.connect_start_audio_call(p_conversation_id uuid, p_offer jsonb)
 RETURNS connect_calls
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_me uuid := auth.uid(); v_peer uuid; v_pair record; v_result public.connect_calls;
begin
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

revoke all on function "public"."connect_start_audio_call"(p_conversation_id uuid, p_offer jsonb) from public,anon,authenticated;

grant execute on function "public"."connect_start_audio_call"(p_conversation_id uuid, p_offer jsonb) to service_role;

grant execute on function "public"."connect_start_audio_call"(p_conversation_id uuid, p_offer jsonb) to "authenticated";

CREATE OR REPLACE FUNCTION public.connect_unified_capabilities()
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$ SELECT '{"activity":1}'::jsonb $function$
;

revoke all on function "public"."connect_unified_capabilities"() from public,anon,authenticated;

grant execute on function "public"."connect_unified_capabilities"() to service_role;

grant execute on function "public"."connect_unified_capabilities"() to "authenticated";

CREATE OR REPLACE FUNCTION public.ensure_connect_profile()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$ BEGIN INSERT INTO public.profiles (id,display_name) VALUES (NEW.id,COALESCE(NULLIF(split_part(NEW.email,'@',1),''),'Пользователь')) ON CONFLICT (id) DO NOTHING; RETURN NEW; END; $function$
;

revoke all on function "public"."ensure_connect_profile"() from public,anon,authenticated;

grant execute on function "public"."ensure_connect_profile"() to service_role;

grant execute on function "public"."ensure_connect_profile"() to public;

grant execute on function "public"."ensure_connect_profile"() to "anon";

grant execute on function "public"."ensure_connect_profile"() to "authenticated";

CREATE OR REPLACE FUNCTION public.protect_conversation_identity()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$ BEGIN IF NEW.id IS DISTINCT FROM OLD.id OR NEW.user_a IS DISTINCT FROM OLD.user_a OR NEW.user_b IS DISTINCT FROM OLD.user_b OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN RAISE EXCEPTION 'Conversation identity cannot be changed'; END IF; RETURN NEW; END; $function$
;

revoke all on function "public"."protect_conversation_identity"() from public,anon,authenticated;

grant execute on function "public"."protect_conversation_identity"() to service_role;

grant execute on function "public"."protect_conversation_identity"() to public;

grant execute on function "public"."protect_conversation_identity"() to "anon";

grant execute on function "public"."protect_conversation_identity"() to "authenticated";

CREATE OR REPLACE FUNCTION public.validate_message_changes()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
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
END $function$
;

revoke all on function "public"."validate_message_changes"() from public,anon,authenticated;

grant execute on function "public"."validate_message_changes"() to service_role;

grant execute on function "public"."validate_message_changes"() to public;

grant execute on function "public"."validate_message_changes"() to "anon";

grant execute on function "public"."validate_message_changes"() to "authenticated";

CREATE INDEX messages_conversation_time_idx ON public.messages USING btree (conversation_id, created_at DESC);

CREATE INDEX connect_fix6_message_page ON public.messages USING btree (conversation_id, created_at, id);

CREATE INDEX connect_messages_active_custom_sticker_body_idx ON public.messages USING btree (body) WHERE ((deleted_at IS NULL) AND (body ~~ '[[connect-custom-sticker:%'::text));

CREATE INDEX push_devices_user_id_idx ON public.push_devices USING btree (user_id);

CREATE INDEX idx_conversation_user_state_delivery ON public.conversation_user_state USING btree (conversation_id, user_id, last_delivered_at);

CREATE UNIQUE INDEX connect_calls_one_live_per_conversation ON public.connect_calls USING btree (conversation_id) WHERE (status = ANY (ARRAY['ringing'::text, 'active'::text]));

CREATE INDEX connect_calls_callee_recent ON public.connect_calls USING btree (callee_id, created_at DESC);

CREATE INDEX connect_calls_caller_recent ON public.connect_calls USING btree (caller_id, created_at DESC);

CREATE INDEX connect_call_ice_by_call ON public.connect_call_ice USING btree (call_id, id);

CREATE INDEX connect_hidden_members_admin_idx ON public.connect_hidden_members USING btree (admin_id);

CREATE INDEX connect_invitation_codes_active_idx ON public.connect_invitation_codes USING btree (expires_at) WHERE ((redeemed_at IS NULL) AND (revoked_at IS NULL));

CREATE INDEX connect_fix6_deleted_cursor ON public.connect_message_tombstones USING btree (deleted_at, message_id);

CREATE INDEX connect_fix6_deleted_chat ON public.connect_message_tombstones USING btree (conversation_id);

CREATE INDEX connect_media_deletion_jobs_sender ON public.connect_media_deletion_jobs USING btree (sender_id, queued_at);

create policy "participants see conversations" on "public"."conversations" as PERMISSIVE for SELECT to "authenticated" using (((( SELECT auth.uid() AS uid) = user_a) OR (( SELECT auth.uid() AS uid) = user_b)));

create policy "participants create conversations" on "public"."conversations" as PERMISSIVE for INSERT to "authenticated" with check ((((( SELECT auth.uid() AS uid) = user_a) OR (( SELECT auth.uid() AS uid) = user_b)) AND (EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (p.is_blocked = false))))));

create policy "participants read messages" on "public"."messages" as PERMISSIVE for SELECT to "authenticated" using ((EXISTS ( SELECT 1
   FROM conversations c
  WHERE ((c.id = messages.conversation_id) AND ((( SELECT auth.uid() AS uid) = c.user_a) OR (( SELECT auth.uid() AS uid) = c.user_b))))));

create policy "participants send messages" on "public"."messages" as PERMISSIVE for INSERT to "authenticated" with check (((sender_id = ( SELECT auth.uid() AS uid)) AND (EXISTS ( SELECT 1
   FROM conversations c
  WHERE ((c.id = messages.conversation_id) AND ((( SELECT auth.uid() AS uid) = c.user_a) OR (( SELECT auth.uid() AS uid) = c.user_b))))) AND (EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (p.is_blocked = false))))));

create policy "sender edits messages" on "public"."messages" as PERMISSIVE for UPDATE to "authenticated" using ((sender_id = ( SELECT auth.uid() AS uid))) with check ((sender_id = ( SELECT auth.uid() AS uid)));

create policy "participants view state" on "public"."conversation_user_state" as PERMISSIVE for SELECT to "authenticated" using ((EXISTS ( SELECT 1
   FROM conversations c
  WHERE ((c.id = conversation_user_state.conversation_id) AND ((c.user_a = ( SELECT auth.uid() AS uid)) OR (c.user_b = ( SELECT auth.uid() AS uid)))))));

create policy "users insert own state" on "public"."conversation_user_state" as PERMISSIVE for INSERT to "authenticated" with check (((user_id = ( SELECT auth.uid() AS uid)) AND (EXISTS ( SELECT 1
   FROM conversations c
  WHERE ((c.id = conversation_user_state.conversation_id) AND ((c.user_a = ( SELECT auth.uid() AS uid)) OR (c.user_b = ( SELECT auth.uid() AS uid))))))));

create policy "users update own state" on "public"."conversation_user_state" as PERMISSIVE for UPDATE to "authenticated" using ((user_id = ( SELECT auth.uid() AS uid))) with check (((user_id = ( SELECT auth.uid() AS uid)) AND (EXISTS ( SELECT 1
   FROM conversations c
  WHERE ((c.id = conversation_user_state.conversation_id) AND ((c.user_a = ( SELECT auth.uid() AS uid)) OR (c.user_b = ( SELECT auth.uid() AS uid))))))));

create policy "members update own profile" on "public"."profiles" as PERMISSIVE for UPDATE to "authenticated" using (((id = auth.uid()) AND (is_blocked = false))) with check (((id = auth.uid()) AND (is_blocked = false)));

create policy "connect avatars read" on "storage"."objects" as PERMISSIVE for SELECT to "authenticated" using (((bucket_id = 'connect-avatars'::text) AND (EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.is_blocked = false))))));

create policy "connect avatars upload own" on "storage"."objects" as PERMISSIVE for INSERT to "authenticated" with check (((bucket_id = 'connect-avatars'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text) AND (EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.is_blocked = false))))));

create policy "connect avatars update own" on "storage"."objects" as PERMISSIVE for UPDATE to "authenticated" using (((bucket_id = 'connect-avatars'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text))) with check (((bucket_id = 'connect-avatars'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text)));

create policy "connect attachment participants read" on "storage"."objects" as PERMISSIVE for SELECT to "authenticated" using (((bucket_id = 'connect-attachments'::text) AND (EXISTS ( SELECT 1
   FROM conversations c
  WHERE (((c.id)::text = (storage.foldername(objects.name))[1]) AND ((c.user_a = ( SELECT auth.uid() AS uid)) OR (c.user_b = ( SELECT auth.uid() AS uid))))))));

create policy "connect attachment sender upload" on "storage"."objects" as PERMISSIVE for INSERT to "authenticated" with check (((bucket_id = 'connect-attachments'::text) AND ((storage.foldername(name))[2] = (( SELECT auth.uid() AS uid))::text) AND (EXISTS ( SELECT 1
   FROM conversations c
  WHERE (((c.id)::text = (storage.foldername(objects.name))[1]) AND ((c.user_a = ( SELECT auth.uid() AS uid)) OR (c.user_b = ( SELECT auth.uid() AS uid)))))) AND (EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (NOT p.is_blocked))))));

create policy "read own preferences" on "public"."notification_preferences" as PERMISSIVE for SELECT to "authenticated" using ((( SELECT auth.uid() AS uid) = user_id));

create policy "insert own preferences" on "public"."notification_preferences" as PERMISSIVE for INSERT to "authenticated" with check ((( SELECT auth.uid() AS uid) = user_id));

create policy "update own preferences" on "public"."notification_preferences" as PERMISSIVE for UPDATE to "authenticated" using ((( SELECT auth.uid() AS uid) = user_id)) with check ((( SELECT auth.uid() AS uid) = user_id));

create policy "audio call participants read" on "public"."connect_calls" as PERMISSIVE for SELECT to "authenticated" using (((( SELECT auth.uid() AS uid) = caller_id) OR (( SELECT auth.uid() AS uid) = callee_id)));

create policy "participants upsert conversations" on "public"."conversations" as PERMISSIVE for UPDATE to "authenticated" using (((auth.uid() = user_a) OR (auth.uid() = user_b))) with check (((auth.uid() = user_a) OR (auth.uid() = user_b)));

create policy "delete own packs" on "public"."connect_sticker_packs" as PERMISSIVE for DELETE to "authenticated" using ((owner_id = ( SELECT auth.uid() AS uid)));

create policy "read visible packs" on "public"."connect_sticker_packs" as PERMISSIVE for SELECT to "authenticated" using ((is_public OR (owner_id = ( SELECT auth.uid() AS uid))));

create policy "create own packs" on "public"."connect_sticker_packs" as PERMISSIVE for INSERT to "authenticated" with check ((owner_id = ( SELECT auth.uid() AS uid)));

create policy "edit own packs" on "public"."connect_sticker_packs" as PERMISSIVE for UPDATE to "authenticated" using ((owner_id = ( SELECT auth.uid() AS uid))) with check ((owner_id = ( SELECT auth.uid() AS uid)));

create policy "members see active profiles" on "public"."profiles" as PERMISSIVE for SELECT to "authenticated" using (((is_blocked = false) OR (id = ( SELECT auth.uid() AS uid)) OR private.can_view_profile(id, ( SELECT auth.uid() AS uid))));

create policy "read visible stickers" on "public"."connect_stickers" as PERMISSIVE for SELECT to "authenticated" using ((EXISTS ( SELECT 1
   FROM connect_sticker_packs p
  WHERE ((p.id = connect_stickers.pack_id) AND (p.is_public OR (p.owner_id = ( SELECT auth.uid() AS uid)))))));

create policy "create own stickers" on "public"."connect_stickers" as PERMISSIVE for INSERT to "authenticated" with check ((EXISTS ( SELECT 1
   FROM connect_sticker_packs p
  WHERE ((p.id = connect_stickers.pack_id) AND (p.owner_id = ( SELECT auth.uid() AS uid)) AND (connect_stickers.storage_path ~~ ((((( SELECT auth.uid() AS uid))::text || '/'::text) || (connect_stickers.pack_id)::text) || '/%'::text))))));

create policy "delete own stickers" on "public"."connect_stickers" as PERMISSIVE for DELETE to "authenticated" using ((EXISTS ( SELECT 1
   FROM connect_sticker_packs p
  WHERE ((p.id = connect_stickers.pack_id) AND (p.owner_id = ( SELECT auth.uid() AS uid))))));

create policy "upload own sticker assets" on "storage"."objects" as PERMISSIVE for INSERT to "authenticated" with check (((bucket_id = 'connect-stickers'::text) AND ((storage.foldername(name))[1] = (( SELECT auth.uid() AS uid))::text)));

create policy "read sticker assets" on "storage"."objects" as PERMISSIVE for SELECT to "authenticated" using (((bucket_id = 'connect-stickers'::text) AND (EXISTS ( SELECT 1
   FROM (connect_stickers s
     JOIN connect_sticker_packs p ON ((p.id = s.pack_id)))
  WHERE ((s.storage_path = objects.name) AND (p.is_public OR (p.owner_id = ( SELECT auth.uid() AS uid))))))));

create policy "delete own sticker assets" on "storage"."objects" as PERMISSIVE for DELETE to "authenticated" using (((bucket_id = 'connect-stickers'::text) AND ((storage.foldername(name))[1] = (( SELECT auth.uid() AS uid))::text)));

create policy "audio ice participants read" on "public"."connect_call_ice" as PERMISSIVE for SELECT to "authenticated" using ((EXISTS ( SELECT 1
   FROM connect_calls c
  WHERE ((c.id = connect_call_ice.call_id) AND ((( SELECT auth.uid() AS uid) = c.caller_id) OR (( SELECT auth.uid() AS uid) = c.callee_id))))));

create policy "audio ice participant sends" on "public"."connect_call_ice" as PERMISSIVE for INSERT to "authenticated" with check (((sender_id = ( SELECT auth.uid() AS uid)) AND (EXISTS ( SELECT 1
   FROM connect_calls c
  WHERE ((c.id = connect_call_ice.call_id) AND ((( SELECT auth.uid() AS uid) = c.caller_id) OR (( SELECT auth.uid() AS uid) = c.callee_id)) AND (c.status = ANY (ARRAY['ringing'::text, 'active'::text])) AND (c.created_at > (now() - '03:00:00'::interval)))))));

create policy "connect profile media upload own" on "storage"."objects" as PERMISSIVE for INSERT to "authenticated" with check (((bucket_id = 'connect-profile-media'::text) AND ((storage.foldername(name))[1] = (( SELECT auth.uid() AS uid))::text) AND ((storage.foldername(name))[2] = ANY (ARRAY['photos'::text, 'videos'::text, 'music'::text]))));

create policy "connect profile media delete own" on "storage"."objects" as PERMISSIVE for DELETE to "authenticated" using (((bucket_id = 'connect-profile-media'::text) AND ((storage.foldername(name))[1] = (( SELECT auth.uid() AS uid))::text) AND ((storage.foldername(name))[2] = ANY (ARRAY['photos'::text, 'videos'::text, 'music'::text]))));

create policy "connect profile media read member" on "storage"."objects" as PERMISSIVE for SELECT to "authenticated" using (((bucket_id = 'connect-profile-media'::text) AND ((storage.foldername(name))[2] = ANY (ARRAY['photos'::text, 'videos'::text, 'music'::text])) AND (EXISTS ( SELECT 1
   FROM profiles owner_profile
  WHERE (((owner_profile.id)::text = (storage.foldername(objects.name))[1]) AND (owner_profile.is_blocked = false))))));

create policy "connect music status read" on "public"."connect_music_presence" as PERMISSIVE for SELECT to "authenticated" using (((owner_id = ( SELECT auth.uid() AS uid)) OR ((is_public = true) AND (EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = connect_music_presence.owner_id) AND (p.is_blocked = false)))))));

create policy "connect music status add own" on "public"."connect_music_presence" as PERMISSIVE for INSERT to "authenticated" with check ((owner_id = ( SELECT auth.uid() AS uid)));

create policy "connect music status change own" on "public"."connect_music_presence" as PERMISSIVE for UPDATE to "authenticated" using ((owner_id = ( SELECT auth.uid() AS uid))) with check ((owner_id = ( SELECT auth.uid() AS uid)));

create policy "connect music status delete own" on "public"."connect_music_presence" as PERMISSIVE for DELETE to "authenticated" using ((owner_id = ( SELECT auth.uid() AS uid)));

create policy "connect call journal read own" on "public"."connect_call_journal_settings" as PERMISSIVE for SELECT to "authenticated" using ((owner_id = ( SELECT auth.uid() AS uid)));

create policy "connect call journal insert own" on "public"."connect_call_journal_settings" as PERMISSIVE for INSERT to "authenticated" with check ((owner_id = ( SELECT auth.uid() AS uid)));

create policy "connect call journal update own" on "public"."connect_call_journal_settings" as PERMISSIVE for UPDATE to "authenticated" using ((owner_id = ( SELECT auth.uid() AS uid))) with check ((owner_id = ( SELECT auth.uid() AS uid)));

create policy "connect hidden profiles isolate" on "public"."profiles" as RESTRICTIVE for SELECT to "authenticated" using (private.connect_can_reach(( SELECT auth.uid() AS uid), id));

create policy "connect hidden conversations read" on "public"."conversations" as RESTRICTIVE for SELECT to "authenticated" using (private.connect_can_reach(user_a, user_b));

create policy "connect hidden conversations create" on "public"."conversations" as RESTRICTIVE for INSERT to "authenticated" with check (private.connect_can_reach(user_a, user_b));

create policy "connect hidden conversations update" on "public"."conversations" as RESTRICTIVE for UPDATE to "authenticated" using (private.connect_can_reach(user_a, user_b)) with check (private.connect_can_reach(user_a, user_b));

create policy "connect hidden messages edits" on "public"."messages" as RESTRICTIVE for UPDATE to "authenticated" using ((EXISTS ( SELECT 1
   FROM conversations c
  WHERE (c.id = messages.conversation_id)))) with check ((EXISTS ( SELECT 1
   FROM conversations c
  WHERE (c.id = messages.conversation_id))));

create policy "connect hidden read states" on "public"."conversation_user_state" as RESTRICTIVE for SELECT to "authenticated" using ((EXISTS ( SELECT 1
   FROM conversations c
  WHERE (c.id = conversation_user_state.conversation_id))));

create policy "connect hidden audio calls" on "public"."connect_calls" as RESTRICTIVE for SELECT to "authenticated" using (private.connect_can_reach(caller_id, callee_id));

create policy "connect hidden music presence" on "public"."connect_music_presence" as RESTRICTIVE for SELECT to "authenticated" using (private.connect_can_reach(( SELECT auth.uid() AS uid), owner_id));

create policy "connect hidden private media" on "storage"."objects" as RESTRICTIVE for SELECT to "authenticated" using (
CASE
    WHEN (bucket_id = ANY (ARRAY['connect-avatars'::text, 'connect-profile-media'::text])) THEN
    CASE
        WHEN (COALESCE((storage.foldername(name))[1], ''::text) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'::text) THEN private.connect_can_reach(( SELECT auth.uid() AS uid), ((storage.foldername(name))[1])::uuid)
        ELSE false
    END
    WHEN (bucket_id = 'connect-stickers'::text) THEN (EXISTS ( SELECT 1
       FROM (connect_stickers st
         JOIN connect_sticker_packs p ON ((p.id = st.pack_id)))
      WHERE ((st.storage_path = objects.name) AND private.connect_can_reach(( SELECT auth.uid() AS uid), p.owner_id))))
    ELSE true
END);

create policy "connect fix6 deleted participants" on "public"."connect_message_tombstones" as PERMISSIVE for SELECT to "authenticated" using ((EXISTS ( SELECT 1
   FROM conversations c
  WHERE ((c.id = connect_message_tombstones.conversation_id) AND ((( SELECT auth.uid() AS uid) = c.user_a) OR (( SELECT auth.uid() AS uid) = c.user_b)) AND private.connect_can_reach(c.user_a, c.user_b)))));

create policy "connect fix6 calls participant fence" on "public"."connect_calls" as RESTRICTIVE for SELECT to "authenticated" using ((((( SELECT auth.uid() AS uid) = caller_id) OR (( SELECT auth.uid() AS uid) = callee_id)) AND private.connect_can_reach(caller_id, callee_id)));

create policy "connect sender hard delete" on "public"."messages" as PERMISSIVE for DELETE to "authenticated" using ((sender_id = ( SELECT auth.uid() AS uid)));

create policy "update own stickers" on "public"."connect_stickers" as PERMISSIVE for UPDATE to "authenticated" using ((EXISTS ( SELECT 1
   FROM connect_sticker_packs p
  WHERE ((p.id = connect_stickers.pack_id) AND (p.owner_id = ( SELECT auth.uid() AS uid)))))) with check (((EXISTS ( SELECT 1
   FROM connect_sticker_packs p
  WHERE ((p.id = connect_stickers.pack_id) AND (p.owner_id = ( SELECT auth.uid() AS uid))))) AND (storage_path ~~ ((((( SELECT auth.uid() AS uid))::text || '/'::text) || (pack_id)::text) || '/%'::text))));

create policy "connect hidden sticker packs" on "public"."connect_sticker_packs" as PERMISSIVE for SELECT to "authenticated" using ((is_public AND private.connect_can_reach(( SELECT auth.uid() AS uid), owner_id)));

create policy "read chat-shared private sticker packs" on "public"."connect_sticker_packs" as PERMISSIVE for SELECT to "authenticated" using (private.connect_sent_sticker_pack_visible(id));

create policy "read chat-shared private stickers" on "public"."connect_stickers" as PERMISSIVE for SELECT to "authenticated" using (private.connect_sent_sticker_visible(id));

create policy "read chat-shared private sticker assets" on "storage"."objects" as PERMISSIVE for SELECT to "authenticated" using (((bucket_id = 'connect-stickers'::text) AND private.connect_sent_sticker_path_visible(name)));

create policy "connect_message_active_session_guard" on "public"."messages" as RESTRICTIVE for ALL to "authenticated" using (( SELECT connect_has_live_session() AS connect_has_live_session)) with check (( SELECT connect_has_live_session() AS connect_has_live_session));

grant INSERT on table "public"."conversations" to "authenticated";

grant SELECT on table "public"."conversations" to "authenticated";

grant UPDATE on table "public"."conversations" to "authenticated";

grant DELETE on table "public"."conversations" to "authenticated";

grant TRUNCATE on table "public"."conversations" to "authenticated";

grant REFERENCES on table "public"."conversations" to "authenticated";

grant TRIGGER on table "public"."conversations" to "authenticated";

grant INSERT on table "public"."conversations" to "service_role";

grant SELECT on table "public"."conversations" to "service_role";

grant UPDATE on table "public"."conversations" to "service_role";

grant DELETE on table "public"."conversations" to "service_role";

grant TRUNCATE on table "public"."conversations" to "service_role";

grant REFERENCES on table "public"."conversations" to "service_role";

grant TRIGGER on table "public"."conversations" to "service_role";

grant INSERT on table "public"."profiles" to "authenticated";

grant SELECT on table "public"."profiles" to "authenticated";

grant UPDATE on table "public"."profiles" to "authenticated";

grant DELETE on table "public"."profiles" to "authenticated";

grant TRUNCATE on table "public"."profiles" to "authenticated";

grant REFERENCES on table "public"."profiles" to "authenticated";

grant TRIGGER on table "public"."profiles" to "authenticated";

grant INSERT on table "public"."profiles" to "service_role";

grant SELECT on table "public"."profiles" to "service_role";

grant UPDATE on table "public"."profiles" to "service_role";

grant DELETE on table "public"."profiles" to "service_role";

grant TRUNCATE on table "public"."profiles" to "service_role";

grant REFERENCES on table "public"."profiles" to "service_role";

grant TRIGGER on table "public"."profiles" to "service_role";

grant INSERT on table "public"."messages" to "authenticated";

grant SELECT on table "public"."messages" to "authenticated";

grant UPDATE on table "public"."messages" to "authenticated";

grant DELETE on table "public"."messages" to "authenticated";

grant TRUNCATE on table "public"."messages" to "authenticated";

grant REFERENCES on table "public"."messages" to "authenticated";

grant TRIGGER on table "public"."messages" to "authenticated";

grant INSERT on table "public"."messages" to "service_role";

grant SELECT on table "public"."messages" to "service_role";

grant UPDATE on table "public"."messages" to "service_role";

grant DELETE on table "public"."messages" to "service_role";

grant TRUNCATE on table "public"."messages" to "service_role";

grant REFERENCES on table "public"."messages" to "service_role";

grant TRIGGER on table "public"."messages" to "service_role";

grant INSERT on table "public"."connect_sticker_packs" to "anon";

grant SELECT on table "public"."connect_sticker_packs" to "anon";

grant UPDATE on table "public"."connect_sticker_packs" to "anon";

grant DELETE on table "public"."connect_sticker_packs" to "anon";

grant TRUNCATE on table "public"."connect_sticker_packs" to "anon";

grant REFERENCES on table "public"."connect_sticker_packs" to "anon";

grant TRIGGER on table "public"."connect_sticker_packs" to "anon";

grant INSERT on table "public"."connect_sticker_packs" to "authenticated";

grant SELECT on table "public"."connect_sticker_packs" to "authenticated";

grant UPDATE on table "public"."connect_sticker_packs" to "authenticated";

grant DELETE on table "public"."connect_sticker_packs" to "authenticated";

grant TRUNCATE on table "public"."connect_sticker_packs" to "authenticated";

grant REFERENCES on table "public"."connect_sticker_packs" to "authenticated";

grant TRIGGER on table "public"."connect_sticker_packs" to "authenticated";

grant INSERT on table "public"."connect_sticker_packs" to "service_role";

grant SELECT on table "public"."connect_sticker_packs" to "service_role";

grant UPDATE on table "public"."connect_sticker_packs" to "service_role";

grant DELETE on table "public"."connect_sticker_packs" to "service_role";

grant TRUNCATE on table "public"."connect_sticker_packs" to "service_role";

grant REFERENCES on table "public"."connect_sticker_packs" to "service_role";

grant TRIGGER on table "public"."connect_sticker_packs" to "service_role";

grant INSERT on table "public"."connect_stickers" to "anon";

grant SELECT on table "public"."connect_stickers" to "anon";

grant UPDATE on table "public"."connect_stickers" to "anon";

grant DELETE on table "public"."connect_stickers" to "anon";

grant TRUNCATE on table "public"."connect_stickers" to "anon";

grant REFERENCES on table "public"."connect_stickers" to "anon";

grant TRIGGER on table "public"."connect_stickers" to "anon";

grant INSERT on table "public"."connect_stickers" to "authenticated";

grant SELECT on table "public"."connect_stickers" to "authenticated";

grant UPDATE on table "public"."connect_stickers" to "authenticated";

grant DELETE on table "public"."connect_stickers" to "authenticated";

grant TRUNCATE on table "public"."connect_stickers" to "authenticated";

grant REFERENCES on table "public"."connect_stickers" to "authenticated";

grant TRIGGER on table "public"."connect_stickers" to "authenticated";

grant INSERT on table "public"."connect_stickers" to "service_role";

grant SELECT on table "public"."connect_stickers" to "service_role";

grant UPDATE on table "public"."connect_stickers" to "service_role";

grant DELETE on table "public"."connect_stickers" to "service_role";

grant TRUNCATE on table "public"."connect_stickers" to "service_role";

grant REFERENCES on table "public"."connect_stickers" to "service_role";

grant TRIGGER on table "public"."connect_stickers" to "service_role";

grant INSERT on table "public"."push_devices" to "service_role";

grant SELECT on table "public"."push_devices" to "service_role";

grant UPDATE on table "public"."push_devices" to "service_role";

grant DELETE on table "public"."push_devices" to "service_role";

grant TRUNCATE on table "public"."push_devices" to "service_role";

grant REFERENCES on table "public"."push_devices" to "service_role";

grant TRIGGER on table "public"."push_devices" to "service_role";

grant INSERT on table "public"."notification_preferences" to "anon";

grant SELECT on table "public"."notification_preferences" to "anon";

grant UPDATE on table "public"."notification_preferences" to "anon";

grant DELETE on table "public"."notification_preferences" to "anon";

grant TRUNCATE on table "public"."notification_preferences" to "anon";

grant REFERENCES on table "public"."notification_preferences" to "anon";

grant TRIGGER on table "public"."notification_preferences" to "anon";

grant INSERT on table "public"."notification_preferences" to "authenticated";

grant SELECT on table "public"."notification_preferences" to "authenticated";

grant UPDATE on table "public"."notification_preferences" to "authenticated";

grant DELETE on table "public"."notification_preferences" to "authenticated";

grant TRUNCATE on table "public"."notification_preferences" to "authenticated";

grant REFERENCES on table "public"."notification_preferences" to "authenticated";

grant TRIGGER on table "public"."notification_preferences" to "authenticated";

grant INSERT on table "public"."notification_preferences" to "service_role";

grant SELECT on table "public"."notification_preferences" to "service_role";

grant UPDATE on table "public"."notification_preferences" to "service_role";

grant DELETE on table "public"."notification_preferences" to "service_role";

grant TRUNCATE on table "public"."notification_preferences" to "service_role";

grant REFERENCES on table "public"."notification_preferences" to "service_role";

grant TRIGGER on table "public"."notification_preferences" to "service_role";

grant INSERT on table "public"."conversation_user_state" to "anon";

grant SELECT on table "public"."conversation_user_state" to "anon";

grant UPDATE on table "public"."conversation_user_state" to "anon";

grant DELETE on table "public"."conversation_user_state" to "anon";

grant TRUNCATE on table "public"."conversation_user_state" to "anon";

grant REFERENCES on table "public"."conversation_user_state" to "anon";

grant TRIGGER on table "public"."conversation_user_state" to "anon";

grant INSERT on table "public"."conversation_user_state" to "authenticated";

grant SELECT on table "public"."conversation_user_state" to "authenticated";

grant UPDATE on table "public"."conversation_user_state" to "authenticated";

grant DELETE on table "public"."conversation_user_state" to "authenticated";

grant TRUNCATE on table "public"."conversation_user_state" to "authenticated";

grant REFERENCES on table "public"."conversation_user_state" to "authenticated";

grant TRIGGER on table "public"."conversation_user_state" to "authenticated";

grant INSERT on table "public"."conversation_user_state" to "service_role";

grant SELECT on table "public"."conversation_user_state" to "service_role";

grant UPDATE on table "public"."conversation_user_state" to "service_role";

grant DELETE on table "public"."conversation_user_state" to "service_role";

grant TRUNCATE on table "public"."conversation_user_state" to "service_role";

grant REFERENCES on table "public"."conversation_user_state" to "service_role";

grant TRIGGER on table "public"."conversation_user_state" to "service_role";

grant INSERT on table "public"."connect_calls" to "service_role";

grant SELECT on table "public"."connect_calls" to "service_role";

grant UPDATE on table "public"."connect_calls" to "service_role";

grant DELETE on table "public"."connect_calls" to "service_role";

grant TRUNCATE on table "public"."connect_calls" to "service_role";

grant REFERENCES on table "public"."connect_calls" to "service_role";

grant TRIGGER on table "public"."connect_calls" to "service_role";

grant SELECT on table "public"."connect_calls" to "authenticated";

grant INSERT on table "public"."connect_call_ice" to "service_role";

grant SELECT on table "public"."connect_call_ice" to "service_role";

grant UPDATE on table "public"."connect_call_ice" to "service_role";

grant DELETE on table "public"."connect_call_ice" to "service_role";

grant TRUNCATE on table "public"."connect_call_ice" to "service_role";

grant REFERENCES on table "public"."connect_call_ice" to "service_role";

grant TRIGGER on table "public"."connect_call_ice" to "service_role";

grant INSERT on table "public"."connect_call_ice" to "authenticated";

grant SELECT on table "public"."connect_call_ice" to "authenticated";

grant INSERT on table "public"."connect_orphan_storage_deletion_jobs" to "service_role";

grant SELECT on table "public"."connect_orphan_storage_deletion_jobs" to "service_role";

grant UPDATE on table "public"."connect_orphan_storage_deletion_jobs" to "service_role";

grant DELETE on table "public"."connect_orphan_storage_deletion_jobs" to "service_role";

grant TRUNCATE on table "public"."connect_orphan_storage_deletion_jobs" to "service_role";

grant REFERENCES on table "public"."connect_orphan_storage_deletion_jobs" to "service_role";

grant TRIGGER on table "public"."connect_orphan_storage_deletion_jobs" to "service_role";

grant INSERT on table "public"."connect_call_push_log" to "service_role";

grant SELECT on table "public"."connect_call_push_log" to "service_role";

grant UPDATE on table "public"."connect_call_push_log" to "service_role";

grant DELETE on table "public"."connect_call_push_log" to "service_role";

grant TRUNCATE on table "public"."connect_call_push_log" to "service_role";

grant REFERENCES on table "public"."connect_call_push_log" to "service_role";

grant TRIGGER on table "public"."connect_call_push_log" to "service_role";

grant INSERT on table "public"."connect_call_journal_settings" to "anon";

grant SELECT on table "public"."connect_call_journal_settings" to "anon";

grant UPDATE on table "public"."connect_call_journal_settings" to "anon";

grant DELETE on table "public"."connect_call_journal_settings" to "anon";

grant TRUNCATE on table "public"."connect_call_journal_settings" to "anon";

grant REFERENCES on table "public"."connect_call_journal_settings" to "anon";

grant TRIGGER on table "public"."connect_call_journal_settings" to "anon";

grant INSERT on table "public"."connect_call_journal_settings" to "authenticated";

grant SELECT on table "public"."connect_call_journal_settings" to "authenticated";

grant UPDATE on table "public"."connect_call_journal_settings" to "authenticated";

grant DELETE on table "public"."connect_call_journal_settings" to "authenticated";

grant TRUNCATE on table "public"."connect_call_journal_settings" to "authenticated";

grant REFERENCES on table "public"."connect_call_journal_settings" to "authenticated";

grant TRIGGER on table "public"."connect_call_journal_settings" to "authenticated";

grant INSERT on table "public"."connect_call_journal_settings" to "service_role";

grant SELECT on table "public"."connect_call_journal_settings" to "service_role";

grant UPDATE on table "public"."connect_call_journal_settings" to "service_role";

grant DELETE on table "public"."connect_call_journal_settings" to "service_role";

grant TRUNCATE on table "public"."connect_call_journal_settings" to "service_role";

grant REFERENCES on table "public"."connect_call_journal_settings" to "service_role";

grant TRIGGER on table "public"."connect_call_journal_settings" to "service_role";

grant INSERT on table "public"."connect_music_presence" to "anon";

grant SELECT on table "public"."connect_music_presence" to "anon";

grant UPDATE on table "public"."connect_music_presence" to "anon";

grant DELETE on table "public"."connect_music_presence" to "anon";

grant TRUNCATE on table "public"."connect_music_presence" to "anon";

grant REFERENCES on table "public"."connect_music_presence" to "anon";

grant TRIGGER on table "public"."connect_music_presence" to "anon";

grant INSERT on table "public"."connect_music_presence" to "authenticated";

grant SELECT on table "public"."connect_music_presence" to "authenticated";

grant UPDATE on table "public"."connect_music_presence" to "authenticated";

grant DELETE on table "public"."connect_music_presence" to "authenticated";

grant TRUNCATE on table "public"."connect_music_presence" to "authenticated";

grant REFERENCES on table "public"."connect_music_presence" to "authenticated";

grant TRIGGER on table "public"."connect_music_presence" to "authenticated";

grant INSERT on table "public"."connect_music_presence" to "service_role";

grant SELECT on table "public"."connect_music_presence" to "service_role";

grant UPDATE on table "public"."connect_music_presence" to "service_role";

grant DELETE on table "public"."connect_music_presence" to "service_role";

grant TRUNCATE on table "public"."connect_music_presence" to "service_role";

grant REFERENCES on table "public"."connect_music_presence" to "service_role";

grant TRIGGER on table "public"."connect_music_presence" to "service_role";

grant INSERT on table "public"."connect_hidden_members" to "service_role";

grant SELECT on table "public"."connect_hidden_members" to "service_role";

grant UPDATE on table "public"."connect_hidden_members" to "service_role";

grant DELETE on table "public"."connect_hidden_members" to "service_role";

grant TRUNCATE on table "public"."connect_hidden_members" to "service_role";

grant REFERENCES on table "public"."connect_hidden_members" to "service_role";

grant TRIGGER on table "public"."connect_hidden_members" to "service_role";

grant INSERT on table "public"."connect_invitation_codes" to "service_role";

grant SELECT on table "public"."connect_invitation_codes" to "service_role";

grant UPDATE on table "public"."connect_invitation_codes" to "service_role";

grant DELETE on table "public"."connect_invitation_codes" to "service_role";

grant TRUNCATE on table "public"."connect_invitation_codes" to "service_role";

grant REFERENCES on table "public"."connect_invitation_codes" to "service_role";

grant TRIGGER on table "public"."connect_invitation_codes" to "service_role";

grant INSERT on table "public"."connect_message_tombstones" to "service_role";

grant SELECT on table "public"."connect_message_tombstones" to "service_role";

grant UPDATE on table "public"."connect_message_tombstones" to "service_role";

grant DELETE on table "public"."connect_message_tombstones" to "service_role";

grant TRUNCATE on table "public"."connect_message_tombstones" to "service_role";

grant REFERENCES on table "public"."connect_message_tombstones" to "service_role";

grant TRIGGER on table "public"."connect_message_tombstones" to "service_role";

grant SELECT on table "public"."connect_message_tombstones" to "authenticated";

grant INSERT on table "public"."connect_media_deletion_jobs" to "service_role";

grant SELECT on table "public"."connect_media_deletion_jobs" to "service_role";

grant UPDATE on table "public"."connect_media_deletion_jobs" to "service_role";

grant DELETE on table "public"."connect_media_deletion_jobs" to "service_role";

grant TRUNCATE on table "public"."connect_media_deletion_jobs" to "service_role";

grant REFERENCES on table "public"."connect_media_deletion_jobs" to "service_role";

grant TRIGGER on table "public"."connect_media_deletion_jobs" to "service_role";

grant INSERT on table "public"."connect_sticker_deletion_jobs" to "service_role";

grant SELECT on table "public"."connect_sticker_deletion_jobs" to "service_role";

grant UPDATE on table "public"."connect_sticker_deletion_jobs" to "service_role";

grant DELETE on table "public"."connect_sticker_deletion_jobs" to "service_role";

grant TRUNCATE on table "public"."connect_sticker_deletion_jobs" to "service_role";

grant REFERENCES on table "public"."connect_sticker_deletion_jobs" to "service_role";

grant TRIGGER on table "public"."connect_sticker_deletion_jobs" to "service_role";

grant INSERT on table "public"."connect_account_file_deletion_jobs" to "service_role";

grant SELECT on table "public"."connect_account_file_deletion_jobs" to "service_role";

grant UPDATE on table "public"."connect_account_file_deletion_jobs" to "service_role";

grant DELETE on table "public"."connect_account_file_deletion_jobs" to "service_role";

grant TRUNCATE on table "public"."connect_account_file_deletion_jobs" to "service_role";

grant REFERENCES on table "public"."connect_account_file_deletion_jobs" to "service_role";

grant TRIGGER on table "public"."connect_account_file_deletion_jobs" to "service_role";

grant usage,select on all sequences in schema public to authenticated,service_role;

CREATE TRIGGER validate_message_changes_trigger BEFORE INSERT OR UPDATE ON public.messages FOR EACH ROW EXECUTE FUNCTION validate_message_changes();

CREATE TRIGGER connect_message_push_trigger AFTER INSERT ON public.messages FOR EACH ROW EXECUTE FUNCTION connect_message_push_notify();

CREATE TRIGGER protect_conversation_identity_trigger BEFORE UPDATE ON public.conversations FOR EACH ROW EXECUTE FUNCTION protect_conversation_identity();

CREATE TRIGGER ensure_connect_profile_on_signup AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION ensure_connect_profile();

CREATE TRIGGER connect_guard_audio_call_visibility BEFORE INSERT OR UPDATE OF status ON public.connect_calls FOR EACH ROW EXECUTE FUNCTION private.connect_guard_audio_call();

CREATE TRIGGER connect_fix6_deleted_event AFTER INSERT OR DELETE OR UPDATE OF deleted_at ON public.messages FOR EACH ROW EXECUTE FUNCTION private.connect_fix6_deleted_event();

CREATE TRIGGER connect_fix6_retired_guard BEFORE INSERT ON public.messages FOR EACH ROW EXECUTE FUNCTION private.connect_fix6_retired_guard();

CREATE TRIGGER connect_queue_removed_media AFTER DELETE ON public.messages FOR EACH ROW EXECUTE FUNCTION private.connect_queue_removed_media();

CREATE TRIGGER connect_queue_deleted_sticker_asset AFTER DELETE OR UPDATE OF storage_path ON public.connect_stickers FOR EACH ROW EXECUTE FUNCTION private.connect_queue_deleted_sticker_asset();

CREATE TRIGGER connect_purge_account_on_auth_delete BEFORE DELETE ON auth.users FOR EACH ROW EXECUTE FUNCTION private.connect_purge_on_auth_delete();

CREATE TRIGGER connect_queue_replaced_avatar AFTER UPDATE OF avatar_path ON public.profiles FOR EACH ROW EXECUTE FUNCTION private.connect_queue_replaced_avatar();

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values ('connect-attachments','connect-attachments',false,104857600,null),('connect-avatars','connect-avatars',false,2097152,ARRAY['image/jpeg','image/png','image/webp']),('connect-stickers','connect-stickers',false,2097152,ARRAY['image/png','image/webp','image/gif']),('connect-profile-media','connect-profile-media',false,104857600,null) on conflict(id) do nothing;

do $$declare t text;begin
 if exists(select 1 from pg_publication where pubname='supabase_realtime')then
  foreach t in array array['messages','connect_calls','connect_call_ice']loop
   if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime'and schemaname='public'and tablename=t)then execute format('alter publication supabase_realtime add table public.%I',t);end if;
  end loop;
 end if;
end $$;
commit;

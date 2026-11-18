begin;
create table if not exists private.connect_retired_storage(
 bucket_id text not null,path text not null,worker uuid not null,lease_until timestamptz not null,
 completed boolean not null default false,primary key(bucket_id,path)
);
alter table private.connect_retired_storage enable row level security;
revoke all on private.connect_retired_storage from public,anon,authenticated;
create or replace function private.connect_media_base(p_path text)returns text
language sql immutable set search_path='' as $$select regexp_replace(p_path,'__(thumb\.webp|poster\.jpg)$','');$$;
create or replace function private.connect_assert_media_live(p_bucket text,p_path text)returns void
language plpgsql security definer set search_path='' as $$
declare base text:=private.connect_media_base(p_path);
begin
 if p_path is null then return;end if;
 perform pg_advisory_xact_lock(hashtextextended(p_bucket||':'||base,0));
 if exists(select 1 from private.connect_retired_storage where bucket_id=p_bucket and path=base)then raise exception 'Media path retired; upload a new object';end if;
end $$;
create or replace function private.connect_guard_message_media()returns trigger
language plpgsql security definer set search_path='' as $$
declare p text;
begin
 if new.deleted_at is not null then return new;end if;
 -- Same sorted lock order for an album and a worker: avoid lock inversions.
 for p in select distinct path from(
  select new.attachment_path path union all
  select match[1] from regexp_matches(case when position('[[connect-album:' in new.body)>0 then new.body else '' end,'"path"[[:space:]]*:[[:space:]]*"([^"\\]+)"','g')match
 )paths where path is not null order by path loop
  perform private.connect_assert_media_live('connect-attachments',p);
 end loop;
 return new;
end $$;
drop trigger if exists connect_guard_message_media on public.messages;
create trigger connect_guard_message_media before insert or update of attachment_path,body,deleted_at on public.messages for each row execute function private.connect_guard_message_media();
create or replace function private.connect_guard_storage_reference()returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if tg_table_schema='storage' then perform private.connect_assert_media_live(new.bucket_id,new.name);
 elsif tg_table_name='profiles' then perform private.connect_assert_media_live('connect-avatars',new.avatar_path);
 else perform private.connect_assert_media_live('connect-stickers',new.storage_path);end if;
 return new;
end $$;
drop trigger if exists connect_guard_storage_path on storage.objects;
create trigger connect_guard_storage_path before insert or update of name on storage.objects for each row execute function private.connect_guard_storage_reference();
drop trigger if exists connect_guard_avatar_reference on public.profiles;
create trigger connect_guard_avatar_reference before insert or update of avatar_path on public.profiles for each row execute function private.connect_guard_storage_reference();
drop trigger if exists connect_guard_sticker_reference on public.connect_stickers;
create trigger connect_guard_sticker_reference before insert or update of storage_path on public.connect_stickers for each row execute function private.connect_guard_storage_reference();
alter function public.connect_media_gc_is_unreferenced(text) volatile;
create or replace function public.connect_gc_prepare(p_bucket text,p_path text,p_worker uuid)returns boolean
language plpgsql security definer set search_path='' as $$
declare base text:=private.connect_media_base(p_path);n integer;
begin
 if p_worker is null or p_bucket not in('connect-attachments','connect-avatars','connect-profile-media','connect-stickers') or base is null or length(base) not between 10 and 900 or base like '%/../%' then return false;end if;
 perform pg_advisory_xact_lock(hashtextextended(p_bucket||':'||base,0));
 if not public.connect_media_gc_is_unreferenced(base) then return false;end if;
 insert into private.connect_retired_storage as r(bucket_id,path,worker,lease_until)values(p_bucket,base,p_worker,now()+interval '2 minutes')
 on conflict(bucket_id,path)do update set worker=excluded.worker,lease_until=excluded.lease_until
 where not r.completed and (r.worker=p_worker or r.lease_until<now());
 get diagnostics n=row_count;return n=1;
end $$;
create or replace function public.connect_gc_ack(p_bucket text,p_path text,p_worker uuid)returns boolean
language plpgsql security definer set search_path='' as $$
declare base text:=private.connect_media_base(p_path);n integer;
begin
 update private.connect_retired_storage set completed=true where bucket_id=p_bucket and path=base and worker=p_worker;
 get diagnostics n=row_count;if n<>1 then return false;end if;
 if p_bucket='connect-attachments' then delete from public.connect_media_deletion_jobs where path=base;end if;
 if p_bucket='connect-stickers' then delete from public.connect_sticker_deletion_jobs where path=base;end if;
 delete from public.connect_account_file_deletion_jobs where bucket_id=p_bucket and private.connect_media_base(path)=base;
 delete from public.connect_orphan_storage_deletion_jobs where bucket_id=p_bucket and private.connect_media_base(path)=base;
 return true;
end $$;
revoke all on function public.connect_gc_prepare(text,text,uuid),public.connect_gc_ack(text,text,uuid) from public,anon,authenticated;
grant execute on function public.connect_gc_prepare(text,text,uuid),public.connect_gc_ack(text,text,uuid) to service_role;
revoke all on function private.connect_media_base(text),private.connect_assert_media_live(text,text),private.connect_guard_message_media(),private.connect_guard_storage_reference() from public,anon,authenticated;

-- Auth identity is deleted; a minimal anonymous profile keeps the peer's history.
alter table public.profiles add column if not exists deleted_at timestamptz;
alter table public.connect_calls drop constraint if exists connect_calls_caller_id_fkey;
alter table public.connect_calls add constraint connect_calls_caller_id_fkey foreign key(caller_id)references public.profiles(id);
alter table public.connect_calls drop constraint if exists connect_calls_callee_id_fkey;
alter table public.connect_calls add constraint connect_calls_callee_id_fkey foreign key(callee_id)references public.profiles(id);
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

  UPDATE public.connect_calls SET status=case when status in('ringing','active') then 'ended' else status end,ended_at=coalesce(ended_at,now()),offer='{}',answer=null WHERE caller_id=p_user_id OR callee_id=p_user_id;
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

  UPDATE public.profiles SET display_name='Удалённый пользователь',bio='',avatar_path=null,is_blocked=true,last_seen_at=null,online_until=null,deleted_at=now() WHERE id=p_user_id;
END
$function$
;
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
  AND NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = p_account AND p.deleted_at IS NULL)
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
create table if not exists private.connect_upload_intents(
 id uuid not null,conversation_id uuid not null,user_id uuid not null,path text not null,
 expires_at timestamptz not null,primary key(id,path)
);
alter table private.connect_upload_intents enable row level security;
revoke all on private.connect_upload_intents from public,anon,authenticated;
create or replace function public.connect_upload_lease(p_id uuid,p_chat uuid,p_paths text[] default '{}',p_action text default 'begin')returns void
language plpgsql security definer set search_path='' as $$
declare p text;
begin
 if not public.connect_has_live_session() or not exists(select 1 from public.conversations c where c.id=p_chat and auth.uid() in(c.user_a,c.user_b)) then raise exception 'Conversation unavailable';end if;
 if p_action in('finish','abandon')then
  if p_action='abandon'then
   insert into public.connect_media_deletion_jobs(message_id,sender_id,conversation_id,path)
   select p_id,auth.uid(),p_chat,path from private.connect_upload_intents where id=p_id and user_id=auth.uid() on conflict do nothing;
  end if;
  delete from private.connect_upload_intents where id=p_id and user_id=auth.uid();return;
 end if;
 if p_action<>'begin' or cardinality(p_paths)>60 then raise exception 'Invalid upload intent';end if;
 for p in select distinct unnest(p_paths)order by 1 loop
  if not starts_with(p,p_chat::text||'/'||auth.uid()::text||'/') or length(p)>900 then raise exception 'Invalid upload path';end if;
  perform private.connect_assert_media_live('connect-attachments',p);
  insert into private.connect_upload_intents values(p_id,p_chat,auth.uid(),p,now()+interval '24 hours')
  on conflict(id,path)do update set expires_at=excluded.expires_at;
 end loop;
end $$;
revoke all on function public.connect_upload_lease(uuid,uuid,text[],text)from public,anon;
grant execute on function public.connect_upload_lease(uuid,uuid,text[],text)to authenticated;
CREATE OR REPLACE FUNCTION public.connect_media_gc_is_unreferenced(p_path text)
 RETURNS boolean
 LANGUAGE sql
 VOLATILE
 SET search_path TO ''
AS $function$
SELECT p_path IS NOT NULL AND char_length(p_path) BETWEEN 10 AND 900
  AND NOT EXISTS(select 1 from private.connect_upload_intents u where u.expires_at>now() and (u.path=private.connect_media_base(p_path)))
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
-- Filter protected rows before LIMIT so retained peer history cannot starve GC.
create or replace function public.connect_gc_candidates(p_kind text,p_sender uuid default null,p_message uuid default null,p_limit integer default 100)returns setof jsonb
language plpgsql security definer set search_path='' as $$
begin
 if p_kind='media'then return query select to_jsonb(j)from public.connect_media_deletion_jobs j
 where(p_sender is null or j.sender_id=p_sender)and(p_message is null or j.message_id=p_message)and public.connect_media_gc_is_unreferenced(j.path)
 order by j.queued_at,j.message_id,j.path limit least(greatest(p_limit,1),500);
 elsif p_kind='sticker'then return query select to_jsonb(j)from public.connect_sticker_deletion_jobs j
 where public.connect_media_gc_is_unreferenced(j.path)order by j.queued_at,j.path limit least(greatest(p_limit,1),500);
 elsif p_kind='account'then return query select to_jsonb(j)from public.connect_account_file_deletion_jobs j
 where public.connect_account_file_gc_is_safe(j.bucket_id,j.path,j.account_id)order by j.queued_at,j.path limit least(greatest(p_limit,1),500);
 else raise exception 'Invalid GC queue';end if;
end $$;
revoke all on function public.connect_gc_candidates(text,uuid,uuid,integer)from public,anon,authenticated;
grant execute on function public.connect_gc_candidates(text,uuid,uuid,integer)to service_role;
commit;

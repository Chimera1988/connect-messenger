-- Additive, repeatable. No legacy message is purged by applying this migration.
-- E2EE remains OFF until trusted-device linking/history quorum/call identity are
-- integrated and independently verified. This migration is not an E2EE rollout.
begin;
select pg_advisory_xact_lock(hashtext('connect-unified-20261109'));
do $$begin
 if to_regclass('public.messages') is null or to_regclass('public.conversations') is null or to_regclass('public.conversation_user_state') is null then
   raise exception 'Connect schema prerequisite missing';
 end if;
end$$;
create schema if not exists private;
revoke all on schema private from public,anon;
alter table public.conversation_user_state add column if not exists activity_kind text;
alter table public.conversation_user_state add column if not exists activity_until timestamptz;
do $$begin
 if not exists(select 1 from pg_constraint where conname='connect_activity_kind_check' and conrelid='public.conversation_user_state'::regclass) then
  alter table public.conversation_user_state add constraint connect_activity_kind_check check(activity_kind is null or activity_kind in('typing','voice','video','sticker','file'));
 end if;
end$$;
create or replace function private.connect_bound_activity() returns trigger language plpgsql set search_path='' as $$begin
 if new.activity_kind is null then new.activity_until:=null;
 elsif new.activity_until is not null then new.activity_until:=least(new.activity_until,now()+interval '10 seconds');end if;
 return new;
end$$;
drop trigger if exists connect_bound_activity on public.conversation_user_state;
create trigger connect_bound_activity before insert or update of activity_kind,activity_until on public.conversation_user_state for each row execute function private.connect_bound_activity();
create table if not exists public.connect_message_tombstones(
 message_id uuid primary key,conversation_id uuid not null references public.conversations(id) on delete cascade,
 deleted_at timestamptz not null default now()
);
create index if not exists connect_tombstones_conversation_time on public.connect_message_tombstones(conversation_id,deleted_at,message_id);
alter table public.connect_message_tombstones enable row level security;
revoke all on public.connect_message_tombstones from public,anon,authenticated;
grant select on public.connect_message_tombstones to authenticated;
drop policy if exists "connect tombstone participants" on public.connect_message_tombstones;
create policy "connect tombstone participants" on public.connect_message_tombstones for select to authenticated using(exists(select 1 from public.conversations c where c.id=conversation_id and (select auth.uid()) in(c.user_a,c.user_b)));
-- GC queue is private, never returned to a client or automatically emptied by
-- deployment. Physical deletion requires an unreferenced-object lease worker.
create table if not exists private.connect_attachment_gc(path text primary key,queued_at timestamptz not null default now(),message_id uuid not null);
revoke all on private.connect_attachment_gc from public,anon,authenticated;
-- Observe the pre-existing delete operation. No NEW body/attachment fields are
-- rewritten here; the project's existing validator remains authoritative.
create or replace function private.connect_observe_deleted_message() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if TG_OP='UPDATE' and (old.deleted_at is not null or new.deleted_at is null) then return new;end if;
 if exists(select 1 from public.conversations where id=old.conversation_id) then
  insert into public.connect_message_tombstones(message_id,conversation_id,deleted_at)
   values(old.id,old.conversation_id,case when TG_OP='UPDATE' then new.deleted_at else now() end)
   on conflict(message_id) do nothing;
 end if;
 if old.attachment_path is not null then
  insert into private.connect_attachment_gc(path,message_id) values(old.attachment_path,old.id) on conflict(path) do nothing;
 end if;
 if TG_OP='DELETE' then return old;end if;
 return new;
end$$;
create or replace function private.connect_guard_deleted_uuid() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if exists(select 1 from public.connect_message_tombstones where message_id=new.id) then raise exception 'Deleted message cannot be restored';end if;
 return new;
end$$;
drop trigger if exists connect_observe_deleted_message on public.messages;
create trigger connect_observe_deleted_message after update of deleted_at or delete on public.messages for each row execute function private.connect_observe_deleted_message();
drop trigger if exists connect_guard_deleted_uuid on public.messages;
create trigger connect_guard_deleted_uuid before insert on public.messages for each row execute function private.connect_guard_deleted_uuid();
create or replace function public.connect_delete_message(p_message_id uuid) returns void language plpgsql security invoker set search_path='' as $$
declare prior_deleted timestamptz;
begin
 if (select auth.uid()) is null then raise exception 'Authentication required';end if;
 select m.deleted_at into prior_deleted from public.messages m where m.id=p_message_id and m.sender_id=(select auth.uid()) for update;
 if not found then raise exception 'Message unavailable or sender permission denied';end if;
 if prior_deleted is not null then return;end if;
 update public.messages set deleted_at=now() where id=p_message_id and sender_id=(select auth.uid());
end$$;
revoke all on function public.connect_delete_message(uuid) from public,anon;
grant execute on function public.connect_delete_message(uuid) to authenticated;
create or replace function public.connect_unified_capabilities() returns jsonb language sql stable security invoker set search_path='' as $$select jsonb_build_object('version',1,'activity',1,'tombstones',1,'e2ee',0)$$;
revoke all on function public.connect_unified_capabilities() from public,anon;
grant execute on function public.connect_unified_capabilities() to authenticated;
create or replace function public.connect_deleted_since(p_after timestamptz,p_id uuid,p_limit integer default 200)
returns table(message_id uuid,conversation_id uuid,deleted_at timestamptz)
language sql stable security invoker set search_path='' as $$
 select t.message_id,t.conversation_id,t.deleted_at from public.connect_message_tombstones t
 where (t.deleted_at,t.message_id)>(p_after,p_id) order by t.deleted_at,t.message_id limit least(greatest(p_limit,1),500)
$$;
revoke all on function public.connect_deleted_since(timestamptz,uuid,integer) from public,anon;
grant execute on function public.connect_deleted_since(timestamptz,uuid,integer) to authenticated;
-- Realtime optional: polling reconciliation remains authoritative offline.
do $$begin
 if exists(select 1 from pg_publication where pubname='supabase_realtime') and not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='connect_message_tombstones') then alter publication supabase_realtime add table public.connect_message_tombstones;end if;
end$$;
commit;

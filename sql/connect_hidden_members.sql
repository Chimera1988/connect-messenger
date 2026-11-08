-- Connect Messenger: hidden members, bound to the invitation's administrator.
-- Designed for the current public.profiles/conversations/messages/connect_calls schema.
-- Apply BEFORE deploying the matching server/client code.
begin;

alter table public.connect_invitation_codes
  add column if not exists invite_type text not null default 'normal';
do $$ begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'connect_invite_type_allowed'
      and conrelid = 'public.connect_invitation_codes'::regclass
  ) then
    alter table public.connect_invitation_codes
      add constraint connect_invite_type_allowed
      check (invite_type in ('normal','hidden'));
  end if;
end $$;

create table if not exists public.connect_hidden_members (
  user_id uuid primary key references auth.users(id) on delete cascade,
  admin_id uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  constraint connect_hidden_member_is_not_admin check (user_id <> admin_id)
);
create index if not exists connect_hidden_members_admin_idx on public.connect_hidden_members(admin_id);
alter table public.connect_hidden_members enable row level security;
revoke all on public.connect_hidden_members from public, anon, authenticated;
grant select,insert,update,delete on public.connect_hidden_members to service_role;

-- Helper is in a non-exposed schema; it only returns whether two IDs may interact.
-- The definer may read the hidden membership table without exposing its rows.
create or replace function private.connect_can_reach(p_first uuid,p_second uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
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
$$;
revoke all on function private.connect_can_reach(uuid,uuid) from public,anon;
grant usage on schema private to authenticated;
grant execute on function private.connect_can_reach(uuid,uuid) to authenticated;

-- Restrictive policies are ANDed with existing permissive policies.
-- This retains all current ownership and blocked-user rules.
drop policy if exists "connect hidden profiles isolate" on public.profiles;
create policy "connect hidden profiles isolate" on public.profiles as restrictive
  for select to authenticated using (private.connect_can_reach((select auth.uid()), id));

drop policy if exists "connect hidden conversations read" on public.conversations;
create policy "connect hidden conversations read" on public.conversations as restrictive
  for select to authenticated using (private.connect_can_reach(user_a,user_b));
drop policy if exists "connect hidden conversations create" on public.conversations;
create policy "connect hidden conversations create" on public.conversations as restrictive
  for insert to authenticated with check (private.connect_can_reach(user_a,user_b));
drop policy if exists "connect hidden conversations update" on public.conversations;
create policy "connect hidden conversations update" on public.conversations as restrictive
  for update to authenticated
  using (private.connect_can_reach(user_a,user_b))
  with check (private.connect_can_reach(user_a,user_b));

-- Messages and reading state use the conversations SELECT policy; additionally
-- restrict edits to old threads that become hidden after registration.
drop policy if exists "connect hidden messages edits" on public.messages;
create policy "connect hidden messages edits" on public.messages as restrictive
  for update to authenticated using (exists(
    select 1 from public.conversations c where c.id = conversation_id
  )) with check (exists(
    select 1 from public.conversations c where c.id = conversation_id
  ));
drop policy if exists "connect hidden read states" on public.conversation_user_state;
create policy "connect hidden read states" on public.conversation_user_state as restrictive
  for select to authenticated using (exists(
    select 1 from public.conversations c where c.id = conversation_id
  ));
drop policy if exists "connect hidden state updates" on public.conversation_user_state;
create policy "connect hidden state updates" on public.conversation_user_state as restrictive
  for update to authenticated using (exists(
    select 1 from public.conversations c where c.id = conversation_id
  )) with check (exists(
    select 1 from public.conversations c where c.id = conversation_id
  ));

-- Audio calls: RLS for listening, trigger for SECURITY DEFINER call RPCs.
drop policy if exists "connect hidden audio calls" on public.connect_calls;
create policy "connect hidden audio calls" on public.connect_calls as restrictive
  for select to authenticated using (private.connect_can_reach(caller_id,callee_id));
create or replace function private.connect_guard_audio_call()
returns trigger language plpgsql security definer set search_path = '' as $$
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
end $$;
revoke all on function private.connect_guard_audio_call() from public,anon,authenticated;
drop trigger if exists connect_guard_audio_call_visibility on public.connect_calls;
create trigger connect_guard_audio_call_visibility
  before insert or update of status on public.connect_calls
  for each row execute function private.connect_guard_audio_call();

-- Music presence and public sticker packs otherwise reveal unknown user IDs.
drop policy if exists "connect hidden music presence" on public.connect_music_presence;
create policy "connect hidden music presence" on public.connect_music_presence as restrictive
  for select to authenticated using (private.connect_can_reach((select auth.uid()),owner_id));
drop policy if exists "connect hidden sticker packs" on public.connect_sticker_packs;
create policy "connect hidden sticker packs" on public.connect_sticker_packs as restrictive
  for select to authenticated using (private.connect_can_reach((select auth.uid()),owner_id));

-- Private storage access. Signed URLs issued before hiding may remain valid until
-- expiry; this controls newly authorized downloads and signed-URL creation.
drop policy if exists "connect hidden private media" on storage.objects;
create policy "connect hidden private media" on storage.objects as restrictive
  for select to authenticated using (
    case
      when bucket_id in ('connect-avatars','connect-profile-media') then
        case when coalesce((storage.foldername(name))[1],'')
                ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
          then private.connect_can_reach((select auth.uid()), (storage.foldername(name))[1]::uuid)
          else false end
      when bucket_id = 'connect-stickers' then
        exists(
          select 1 from public.connect_stickers st
          join public.connect_sticker_packs p on p.id = st.pack_id
          where st.storage_path = objects.name
            and private.connect_can_reach((select auth.uid()), p.owner_id)
        )
      else true
    end
  );

commit;

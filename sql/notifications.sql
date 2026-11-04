-- Apply only after reviewing in Supabase SQL editor.
create table if not exists public.push_devices (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 platform text not null check (platform in ('web','android')),
 endpoint text not null,
 subscription jsonb,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique (user_id,endpoint)
);
create index if not exists push_devices_user_id_idx on public.push_devices(user_id);
alter table public.push_devices enable row level security;
revoke all on public.push_devices from anon, authenticated;
-- Only server-side service-role code may access tokens/subscriptions.
create table if not exists public.notification_preferences (
 user_id uuid primary key references auth.users(id) on delete cascade,
 enabled boolean not null default true,
 sound text not null default 'soft',
 vibrate boolean not null default true,
 updated_at timestamptz not null default now(),
 constraint notification_sound_check check (sound in ('soft','bright','gentle','silent'))
);
alter table public.notification_preferences enable row level security;
grant select,insert,update on public.notification_preferences to authenticated;
create policy "read own preferences" on public.notification_preferences for select to authenticated using ((select auth.uid()) = user_id);
create policy "insert own preferences" on public.notification_preferences for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "update own preferences" on public.notification_preferences for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

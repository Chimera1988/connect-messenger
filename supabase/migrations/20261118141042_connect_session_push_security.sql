-- Upgrade existing Connect; does not remove messages or media.
begin;
select pg_advisory_xact_lock(hashtext('connect-session-push-security-v1'));
create schema if not exists private;
create table if not exists private.connect_rate_limits (
 user_id uuid not null, action text not null, window_at timestamptz not null,
 requests integer not null, primary key(user_id,action)
);
alter table private.connect_rate_limits enable row level security;
revoke all on private.connect_rate_limits from public,anon,authenticated;
create or replace function public.connect_consume_rate_limit(p_user_id uuid,p_action text,p_limit integer,p_seconds integer)
returns boolean language plpgsql security definer set search_path='' as $$
declare n integer; t timestamptz:=clock_timestamp();
begin
 if p_user_id is null or p_action is null or length(p_action)>64 or p_limit not between 1 and 10000 or p_seconds not between 1 and 86400 then raise exception 'Invalid rate limit';end if;
 insert into private.connect_rate_limits as r(user_id,action,window_at,requests)
 values(p_user_id,p_action,t,1) on conflict(user_id,action) do update set
 requests=case when r.window_at<=t-make_interval(secs=>p_seconds) then 1 else least(r.requests+1,p_limit+1) end,
 window_at=case when r.window_at<=t-make_interval(secs=>p_seconds) then t else r.window_at end
 returning requests into n;
 return n<=p_limit;
end $$;
revoke all on function public.connect_consume_rate_limit(uuid,text,integer,integer) from public,anon,authenticated;
grant execute on function public.connect_consume_rate_limit(uuid,text,integer,integer) to service_role;
alter table public.push_devices add column if not exists session_id uuid references auth.sessions(id) on delete cascade;
update public.push_devices set needs_push_refresh=true where session_id is null;
-- One installation can be rebound atomically; retain the newest legacy registration.
delete from public.push_devices a using public.push_devices b where a.endpoint=b.endpoint and (a.updated_at,a.id)<(b.updated_at,b.id);
create unique index if not exists connect_push_installation_endpoint on public.push_devices(endpoint);
create or replace function public.connect_register_push_device(p_user_id uuid,p_session_id uuid,p_platform text,p_endpoint text,p_subscription jsonb)
returns boolean language plpgsql security definer set search_path='' as $$
begin
 if not public.connect_auth_session_active(p_user_id,p_session_id) then raise exception 'Session unavailable' using errcode='28000';end if;
 if not exists(select 1 from public.profiles where id=p_user_id and not is_blocked) then raise exception 'Access denied' using errcode='42501';end if;
 if p_platform not in ('web','android') or p_endpoint is null or length(p_endpoint) not between 32 and 4096 then raise exception 'Invalid endpoint';end if;
 if not public.connect_consume_rate_limit(p_user_id,'push-register',12,60) then return false;end if;
 insert into public.push_devices(user_id,platform,endpoint,subscription,session_id,updated_at)
 values(p_user_id,p_platform,p_endpoint,p_subscription,p_session_id,now()) on conflict(endpoint) do update set
 user_id=excluded.user_id,platform=excluded.platform,subscription=excluded.subscription,session_id=excluded.session_id,updated_at=excluded.updated_at,needs_push_refresh=false;
 return true;
end $$;
revoke all on function public.connect_register_push_device(uuid,uuid,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.connect_register_push_device(uuid,uuid,text,text,jsonb) to service_role;
-- Never borrow a different device session for an unbound legacy registration.
-- Opening the client re-registers the installation through the unchanged API.
create or replace function public.connect_push_targets(p_user_ids uuid[])
returns setof public.push_devices language sql stable security definer set search_path='' as $$
 select d.* from public.push_devices d join public.profiles p on p.id=d.user_id
 where d.user_id=any(p_user_ids) and not p.is_blocked and exists(
 select 1 from auth.sessions s where s.user_id=d.user_id and s.id=d.session_id
 and (s.not_after is null or s.not_after>now()))
$$;
revoke all on function public.connect_push_targets(uuid[]) from public,anon,authenticated;
grant execute on function public.connect_push_targets(uuid[]) to service_role;
revoke all on function public.ensure_connect_profile() from public,anon,authenticated;
notify pgrst,'reload schema';
commit;

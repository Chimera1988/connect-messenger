-- Connect audio calls: private call signaling and ICE candidates.
-- Apply on the connect-messenger Supabase project. The migration is additive.
-- Uses server-enforced state transitions; users never directly update calls.
create table if not exists public.connect_calls (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  caller_id uuid not null references auth.users(id) on delete cascade,
  callee_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'ringing' check (status in ('ringing','active','ended','declined','missed','busy','failed')),
  offer jsonb not null,
  answer jsonb,
  created_at timestamptz not null default now(),
  answered_at timestamptz,
  ended_at timestamptz,
  constraint connect_calls_two_people check (caller_id <> callee_id)
);
create unique index if not exists connect_calls_one_live_per_conversation
  on public.connect_calls(conversation_id) where status in ('ringing','active');
create index if not exists connect_calls_callee_recent on public.connect_calls(callee_id,created_at desc);
create index if not exists connect_calls_caller_recent on public.connect_calls(caller_id,created_at desc);
alter table public.connect_calls enable row level security;
revoke all on public.connect_calls from public, anon, authenticated;
grant select on public.connect_calls to authenticated;
drop policy if exists "audio call participants read" on public.connect_calls;
create policy "audio call participants read" on public.connect_calls for select to authenticated
using ((select auth.uid()) in (caller_id,callee_id));

create table if not exists public.connect_call_ice (
  id bigint generated always as identity primary key,
  call_id uuid not null references public.connect_calls(id) on delete cascade,
  sender_id uuid not null references auth.users(id) on delete cascade,
  candidate jsonb not null,
  created_at timestamptz not null default now(),
  constraint connect_call_candidate_length check (octet_length(candidate::text) <= 8192)
);
create index if not exists connect_call_ice_by_call on public.connect_call_ice(call_id,id);
alter table public.connect_call_ice enable row level security;
revoke all on public.connect_call_ice from public, anon, authenticated;
grant select, insert on public.connect_call_ice to authenticated;
drop policy if exists "audio ice participants read" on public.connect_call_ice;
create policy "audio ice participants read" on public.connect_call_ice for select to authenticated
using (exists(select 1 from public.connect_calls c where c.id=call_id and (select auth.uid()) in(c.caller_id,c.callee_id)));
drop policy if exists "audio ice participant sends" on public.connect_call_ice;
create policy "audio ice participant sends" on public.connect_call_ice for insert to authenticated
with check (sender_id=(select auth.uid()) and exists (
  select 1 from public.connect_calls c where c.id=call_id
    and (select auth.uid()) in(c.caller_id,c.callee_id)
    and c.status in ('ringing','active')
    and c.created_at > now()-interval '3 hours'
));

-- Create a call only for an existing conversation's real participants.
create or replace function public.connect_start_audio_call(p_conversation_id uuid, p_offer jsonb)
returns public.connect_calls
language plpgsql security definer set search_path = '' as $$
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
  -- Self-clean stale sessions so a lost connection does not block calls forever.
  update public.connect_calls set status='missed',ended_at=now()
    where conversation_id=p_conversation_id and status='ringing'
      and created_at < now()-interval '60 seconds';
  update public.connect_calls set status='ended',ended_at=now()
    where conversation_id=p_conversation_id and status='active'
      and created_at < now()-interval '8 hours';
  insert into public.connect_calls(conversation_id,caller_id,callee_id,offer)
    values(p_conversation_id,v_me,v_peer,p_offer) returning * into v_result;
  return v_result;
end;$$;

create or replace function public.connect_answer_audio_call(p_call_id uuid, p_answer jsonb)
returns public.connect_calls
language plpgsql security definer set search_path = '' as $$
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
end;$$;

create or replace function public.connect_finish_audio_call(p_call_id uuid, p_reason text default 'hangup')
returns public.connect_calls
language plpgsql security definer set search_path = '' as $$
declare v_call public.connect_calls; v_state text;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  select * into v_call from public.connect_calls where id=p_call_id for update;
  if not found or auth.uid() not in(v_call.caller_id,v_call.callee_id) then
    raise exception 'Call unavailable';
  end if;
  if v_call.status not in('ringing','active') then return v_call; end if;
  v_state := case
    when v_call.status='ringing' and v_call.callee_id=auth.uid() and p_reason='decline' then 'declined'
    when v_call.status='ringing' and v_call.callee_id=auth.uid() and p_reason='busy' then 'busy'
    when v_call.status='ringing' and v_call.caller_id=auth.uid() and p_reason='missed'
      and v_call.created_at<now()-interval '40 seconds' then 'missed'
    when p_reason='failed' then 'failed'
    else 'ended' end;
  update public.connect_calls set status=v_state,ended_at=now() where id=p_call_id returning * into v_call;
  return v_call;
end;$$;

revoke all on function public.connect_start_audio_call(uuid,jsonb) from public,anon;
revoke all on function public.connect_answer_audio_call(uuid,jsonb) from public,anon;
revoke all on function public.connect_finish_audio_call(uuid,text) from public,anon;
grant execute on function public.connect_start_audio_call(uuid,jsonb) to authenticated;
grant execute on function public.connect_answer_audio_call(uuid,jsonb) to authenticated;
grant execute on function public.connect_finish_audio_call(uuid,text) to authenticated;

-- Supabase Realtime: new-call notifications, state updates and ICE trickle.
do $$ begin
  alter publication supabase_realtime add table public.connect_calls;
exception when duplicate_object then null; end $$;
do $$ begin
  alter publication supabase_realtime add table public.connect_call_ice;
exception when duplicate_object then null; end $$;

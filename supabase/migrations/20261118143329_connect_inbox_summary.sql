begin;
-- SECURITY INVOKER: existing participant RLS remains authoritative. Local hides
-- affect only the caller's summary and cannot reveal another conversation.
create or replace function public.connect_inbox_summary(
 p_read jsonb default '{}',p_cleared jsonb default '{}',p_hidden uuid[] default '{}'
) returns table(conversation_id uuid,latest jsonb,unread_count bigint,incoming_at timestamptz,states jsonb)
language sql stable security invoker set search_path='' as $$
 select c.id,
  (select to_jsonb(m) from public.messages m where m.conversation_id=c.id and m.deleted_at is null
   and not(m.id=any(coalesce(p_hidden,'{}'))) and m.created_at>coalesce(nullif(p_cleared->>c.id::text,'')::timestamptz,'-infinity')
   order by m.created_at desc,m.id desc limit 1),
  (select count(*) from public.messages m where m.conversation_id=c.id and m.sender_id<>auth.uid() and m.deleted_at is null
   and not(m.id=any(coalesce(p_hidden,'{}'))) and m.created_at>greatest(
    coalesce(nullif(p_read->>c.id::text,'')::timestamptz,'-infinity'),
    coalesce(nullif(p_cleared->>c.id::text,'')::timestamptz,'-infinity'),coalesce(me.last_read_at,'-infinity'))),
  (select max(m.created_at) from public.messages m where m.conversation_id=c.id and m.sender_id<>auth.uid() and m.deleted_at is null),
  coalesce((select jsonb_agg(to_jsonb(s)) from public.conversation_user_state s where s.conversation_id=c.id),'[]'::jsonb)
 from public.conversations c left join public.conversation_user_state me on me.conversation_id=c.id and me.user_id=auth.uid()
 where auth.uid() in(c.user_a,c.user_b);
$$;
revoke all on function public.connect_inbox_summary(jsonb,jsonb,uuid[]) from public,anon;
grant execute on function public.connect_inbox_summary(jsonb,jsonb,uuid[]) to authenticated;
do $$declare t text;begin
 if exists(select 1 from pg_publication where pubname='supabase_realtime')then
  foreach t in array array['conversation_user_state','profiles','conversations']loop
   if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime'and schemaname='public'and tablename=t)then execute format('alter publication supabase_realtime add table public.%I',t);end if;
  end loop;
 end if;
end $$;
commit;

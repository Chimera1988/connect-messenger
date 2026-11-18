-- Read-only applicability guard. Uses catalog definitions, never application rows.
-- Allows the observed source or this reviewed target, including a partial retry.
do $preflight$
declare expected record;actual text;
begin
 for expected in select * from(values
('private.connect_purge_account_data(uuid)','b21478677366882606c8e4bf6563a0b1','5a216b9baf8041d481962c0aa4dc4fe0'),
('private.connect_expire_call_leases()',null,'a4d8afd3f95e83bde47597fc274e17fa'),
('private.connect_media_base(text)',null,'4b38df44692b346c91eef4ea85ef861d'),
('private.connect_assert_media_live(text, text)',null,'eb68de5cb13e4c3f54b2ec98d55a9941'),
('private.connect_guard_message_media()',null,'411d92c33e1de18614164d130f90bd49'),
('private.connect_guard_storage_reference()',null,'7b633806e329da49905c0e45c6c4762b'),
('public.connect_account_file_gc_is_safe(text, text, uuid)','dc6692cbf206c12bc074d3954f75e0f2','4a9c0f79ca0a9385f41339f72c2bfa11'),
('public.connect_answer_audio_call(uuid, jsonb)','a7620f3461188b892349ab7ca8d28c97','e70a9ac2b37c4ac02881721cadb322bc'),
('public.connect_delete_message(uuid)','fcb13b9ee7f5e310f7f5fbf79f2c3e56','33312f753c51a78b6088a1650da95dad'),
('public.connect_finish_audio_call(uuid, text)','23980bb84da4fcbb073373fba456f4de','70c7741e816d3cd66f27ea4b8fd450c3'),
('public.connect_finish_owned_audio_call(uuid, text, text)','a3bcc8a53144e45279ce3f1a3c560af7','5de555dd006aadd28f01c18331a8bf25'),
('public.connect_has_live_session()','953a2eb03aaa3149a4077bffdd30f892','7883190291a27d970ad38bf7f6335a7a'),
('public.connect_media_gc_is_unreferenced(text)','48ccce63c2e8854f634cc261469bc0b9','5d730db1628cd12b5f7470bd9684a206'),
('public.connect_start_audio_call(uuid, jsonb)','6457d14c11d44967207808562b07f200','9aa239e02f8a5b40577720d418faa1d5'),
('public.connect_heartbeat_audio_call(uuid, text)',null,'01124afd155a16888a92ed8e0762dded'),
('public.connect_consume_rate_limit(uuid, text, integer, integer)',null,'cacf1e9baa61017916ecc00adf61fe55'),
('public.connect_register_push_device(uuid, uuid, text, text, jsonb)',null,'9fd3583a743a2aed8c57a5f903b61f8a'),
('public.connect_push_targets(uuid[])',null,'a90bc4d6041417bfea9f6f20fc26f4ce'),
('public.connect_inbox_summary(jsonb, jsonb, uuid[])',null,'596063da8476861cb8236028e9add7f6'),
('public.connect_gc_ack(text, text, uuid)',null,'eed12704b96d85085571ea3be107bc8f'),
('public.connect_gc_prepare(text, text, uuid)',null,'139639e0768c8d62c5de161b754ed33d'),
('public.connect_upload_lease(uuid, uuid, text[], text)',null,'4b52fa94848ca6eaa02fc5612b1dbd1b'),
('public.connect_gc_candidates(text, uuid, uuid, integer)',null,'4ec638e5650cfb7fa11c1eda91c69497')
)as defs(signature,source_hash,target_hash)loop
  select md5(pg_get_functiondef(to_regprocedure(expected.signature)))into actual;
  if actual is distinct from expected.source_hash and actual is distinct from expected.target_hash then raise exception 'BACKEND_SOURCE_DRIFT: %',expected.signature;end if;
 end loop;
 if not exists(select 1 from pg_publication where pubname='supabase_realtime')then raise exception 'Supabase Realtime publication missing';end if;
end $preflight$;

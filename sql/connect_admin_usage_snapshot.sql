-- Connect admin observability: one read-only, privileged aggregate.
-- Only the Next.js server service-role can execute this; regular clients cannot.
BEGIN;
CREATE OR REPLACE FUNCTION public.connect_admin_usage_snapshot(p_user_id uuid, p_session_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
DECLARE
  result jsonb;
BEGIN
  IF p_user_id IS NULL OR p_session_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM auth.sessions AS s WHERE s.id = p_session_id AND s.user_id = p_user_id
  ) THEN
    RAISE EXCEPTION 'Inactive session' USING ERRCODE = '28000';
  END IF;

  WITH object_sizes AS (
    SELECT
      o.bucket_id,
      o.created_at,
      CASE WHEN (o.metadata->>'size') ~ '^[0-9]{1,18}$'
           THEN (o.metadata->>'size')::bigint ELSE 0::bigint END AS bytes
    FROM storage.objects AS o
  ), per_bucket AS (
    SELECT bucket_id, count(*)::bigint AS files,
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
$function$;
REVOKE ALL ON FUNCTION public.connect_admin_usage_snapshot(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.connect_admin_usage_snapshot(uuid, uuid) TO service_role;
COMMENT ON FUNCTION public.connect_admin_usage_snapshot(uuid,uuid)
IS 'Connect server-only read-only storage usage snapshot; requires current Supabase auth session.';
COMMIT;

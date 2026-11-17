-- Applied to Supabase by an administrator; kept in GitHub for auditability.
-- Client users and anonymous callers have no EXECUTE privilege.
BEGIN;
CREATE OR REPLACE FUNCTION public.connect_auth_session_active(p_user_id uuid,p_session_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog
AS $$
  SELECT p_user_id IS NOT NULL AND p_session_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM auth.sessions s
    WHERE s.user_id=p_user_id AND s.id=p_session_id
    AND (s.not_after IS NULL OR s.not_after > now())
  );
$$;
REVOKE ALL ON FUNCTION public.connect_auth_session_active(uuid,uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.connect_auth_session_active(uuid,uuid) TO service_role;
COMMENT ON FUNCTION public.connect_auth_session_active(uuid,uuid)
IS 'Server-only check of active Supabase Auth session for Connect fail-closed UI. No private data exposed.';
COMMIT;

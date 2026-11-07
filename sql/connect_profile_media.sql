-- Connect profile media: each owner manages own files; logged-in members may view other active profiles.
-- The bucket remains PRIVATE: no anonymous/public bucket access.
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('connect-profile-media','connect-profile-media',false,104857600)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "connect profile media read own" ON storage.objects;
DROP POLICY IF EXISTS "connect profile media read member" ON storage.objects;
CREATE POLICY "connect profile media read member" ON storage.objects
FOR SELECT TO authenticated USING (
  bucket_id='connect-profile-media'
  AND (storage.foldername(name))[2] IN ('photos','videos','music')
  AND EXISTS (
    SELECT 1 FROM public.profiles owner_profile
    WHERE owner_profile.id::text = (storage.foldername(name))[1]
      AND owner_profile.is_blocked = false
  )
);

DROP POLICY IF EXISTS "connect profile media upload own" ON storage.objects;
CREATE POLICY "connect profile media upload own" ON storage.objects
FOR INSERT TO authenticated WITH CHECK (
  bucket_id='connect-profile-media'
  AND (storage.foldername(name))[1] = (SELECT auth.uid())::text
  AND (storage.foldername(name))[2] IN ('photos','videos','music')
);

DROP POLICY IF EXISTS "connect profile media delete own" ON storage.objects;
CREATE POLICY "connect profile media delete own" ON storage.objects
FOR DELETE TO authenticated USING (
  bucket_id='connect-profile-media'
  AND (storage.foldername(name))[1] = (SELECT auth.uid())::text
  AND (storage.foldername(name))[2] IN ('photos','videos','music')
);

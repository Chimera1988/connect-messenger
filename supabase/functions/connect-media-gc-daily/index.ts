import {collectObject} from '../_shared/gc.ts';
import { createClient } from 'npm:@supabase/supabase-js@2.57.0';

const respond = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

Deno.serve(async (request: Request) => {
  if (request.method !== 'POST') return respond({ error: 'Method not allowed' }, 405);

  const token = request.headers.get('x-connect-gc-token') ?? '';
  if (!/^[a-f0-9]{64}$/.test(token)) return respond({ error: 'Unauthorized' }, 401);

  const url = Deno.env.get('SUPABASE_URL');
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key) return respond({ error: 'Server not configured' }, 503);

  const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const authorization = await db.rpc('connect_media_gc_authorized', { p_token: token });
  if (authorization.error || authorization.data !== true) {
    return respond({ error: 'Unauthorized' }, 401);
  }

  const worker=crypto.randomUUID();
  try {
    const {data:jobs,error:loadError}=await db.rpc('connect_gc_candidates',{p_kind:'media',p_limit:500});
    if (loadError) throw loadError;

    let processed = 0;
    let protectedJobs = 0;
    let failures = 0;
    let removalRequests = 0;

    const isUnreferenced = async (path: string): Promise<boolean> => {
      const { data, error } = await db.rpc('connect_media_gc_is_unreferenced', { p_path: path });
      if (error) throw error;
      return data === true;
    };

    for (const job of jobs ?? []) {
      const path = job.path;
      const prefix = String(job.conversation_id) + '/' + String(job.sender_id) + '/';
      if (typeof path !== 'string' || path.length < 10 || path.length > 900 ||
          !path.startsWith(prefix) || path.includes('/../') || path.includes('//')) {
        protectedJobs++;
        continue;
      }

      try {
        if (!(await isUnreferenced(path))) {
          protectedJobs++;
          continue;
        }

        const candidates = [path, path + '__thumb.webp', path + '__poster.jpg'];
        const safePaths: string[] = [];
        for (const candidate of candidates) {
          if (candidate.length <= 900 && await isUnreferenced(candidate)) {
            safePaths.push(candidate);
          }
        }
        if (!safePaths.includes(path)) {
          protectedJobs++;
          continue;
        }

        if(!await collectObject(db,'connect-attachments',path,worker)){protectedJobs++;continue;}
        removalRequests++;
        processed++;
      } catch (error) {
        failures++;
        console.error('Connect GC job failed', error instanceof Error ? error.name : 'UnknownError');
      }
    }

    // Collect retired sticker assets after editing, deletion, or entire pack removal.
    const {data:stickerJobs,error:stickerLoadError}=await db.rpc('connect_gc_candidates',{p_kind:'sticker',p_limit:150});
    if (stickerLoadError) throw stickerLoadError;

    let stickerProcessed = 0;
    let stickerFailures = 0;
    let stickerProtected = 0;
    for (const job of stickerJobs ?? []) {
      const path = job.path;
      const segments = typeof path === 'string' ? path.split('/') : [];
      if (typeof path !== 'string' || path.length > 900 ||
          segments.length !== 3 || segments.some(s => !s || s === '..') ||
          !/^[0-9a-f-]{36}$/i.test(segments[0]) ||
          !/^[0-9a-f-]{36}$/i.test(segments[1])) {
        stickerProtected++;
        continue;
      }
      try {
        const { data: references, error: referencesError } = await db
          .from('connect_stickers').select('id')
          .eq('storage_path', path).limit(1);
        if (referencesError) throw referencesError;
        if (references?.length) { stickerProtected++; continue; }
        if(!await collectObject(db,'connect-stickers',path,worker)){stickerProtected++;continue;}
        stickerProcessed++;
      } catch (error) {
        stickerFailures++;
        console.error('Connect sticker GC failed', error instanceof Error ? error.name : 'error');
      }
    }

    // Account-wide media deletion: only after Auth hard-delete and reference checks.
    const {data:accountJobs,error:accountLoadError}=await db.rpc('connect_gc_candidates',{p_kind:'account',p_limit:250});
    if (accountLoadError) throw accountLoadError;
    let accountProcessed = 0;
    let accountProtected = 0;
    let accountFailures = 0;
    for (const job of accountJobs ?? []) {
      const bucket = job.bucket_id;
      const path = job.path;
      if (!['connect-attachments','connect-avatars','connect-profile-media','connect-stickers'].includes(bucket)
          || typeof path !== 'string' || !path || path.length > 900 || path.includes('/../')) {
        accountProtected++;
        continue;
      }
      try {
        const { data: safe, error: safeError } = await db.rpc('connect_account_file_gc_is_safe', {
          p_bucket: bucket, p_path: path, p_account: job.account_id,
        });
        if (safeError) throw safeError;
        if (safe !== true) { accountProtected++; continue; }
        if(!await collectObject(db,bucket,path,worker)){accountProtected++;continue;}
        accountProcessed++;
      } catch (error) {
        accountFailures++;
        console.error('Connect account file cleanup failed', error instanceof Error ? error.name : 'UnknownError');
      }
    }
    const { count: accountRemaining, error: accountCountError } = await db
      .from('connect_account_file_deletion_jobs')
      .select('path', { count: 'exact', head: true });
    if (accountCountError) throw accountCountError;


    // Sweep orphan avatars and attachments that passed a 24h grace period.
    // The server-side RPC excludes active messages AND their derived previews.
    const { data: orphanCandidates, error: orphanCandidateError } = await db.rpc(
      'connect_orphan_storage_gc_candidates', { p_limit: 100 },
    );
    if (orphanCandidateError) throw orphanCandidateError;
    let orphanProcessed = 0;
    let orphanFailures = 0;
    const orphanBuckets = ['connect-avatars', 'connect-attachments'] as const;
    for (const bucket of orphanBuckets) {
      const paths = (orphanCandidates ?? [])
        .filter((x:{bucket_id:string;path:unknown}) => x.bucket_id === bucket && typeof x.path === 'string')
        .map((x:{path:unknown}) => x.path as string);
      for (let start = 0; start < paths.length; start += 25) {
        const slice = paths.slice(start, start + 25);
        if (!slice.length) continue;
        try {
          for(const path of slice)if(await collectObject(db,bucket,path,worker))orphanProcessed++;
        } catch(error) {
          orphanFailures += slice.length;
          console.error('Connect orphan storage batch failed', error instanceof Error ? error.name : 'UnknownError');
        }
      }
    }
    const { count: orphanRemaining, error: orphanCountError } = await db
      .from('connect_orphan_storage_deletion_jobs')
      .select('path', { count: 'exact', head: true });
    if (orphanCountError) throw orphanCountError;

    const { count: stickerRemaining, error: stickerCountError } = await db
      .from('connect_sticker_deletion_jobs')
      .select('path', { count: 'exact', head: true });
    if (stickerCountError) throw stickerCountError;

    const { count, error: countError } = await db.from('connect_media_deletion_jobs')
      .select('message_id', { count: 'exact', head: true });
    if (countError) throw countError;

    console.info(JSON.stringify({
      event: 'connect_media_gc_daily',
      selected: jobs?.length ?? 0, processed, protected: protectedJobs,
      failures, remaining: count ?? null, stickerProcessed, stickerFailures, stickerRemaining,
      accountProcessed, accountProtected, accountFailures, accountRemaining,
      orphanProcessed, orphanFailures, orphanRemaining
    }));
    return respond({
      selected: jobs?.length ?? 0, processed_jobs: processed,
      storage_remove_requests: removalRequests, protected_jobs: protectedJobs,
      errors: failures + stickerFailures + accountFailures + orphanFailures, remaining_jobs: count,
      sticker_processed_jobs: stickerProcessed, sticker_protected_jobs: stickerProtected, sticker_remaining_jobs: stickerRemaining,
      account_processed_files: accountProcessed, account_protected_files: accountProtected,
      account_remaining_files: accountRemaining,
      orphan_processed_files: orphanProcessed, orphan_failed_files: orphanFailures,
      orphan_remaining_files: orphanRemaining
    }, failures + stickerFailures + accountFailures + orphanFailures > 0 ? 503 : 200);
  } catch (error) {
    console.error('Connect GC run failed', error instanceof Error ? error.name : 'UnknownError');
    return respond({ error: 'Media collection failed; jobs remain for retry' }, 503);
  }
});


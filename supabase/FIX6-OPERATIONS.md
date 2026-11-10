# Connect FIX6: additive server change

This release uses the existing accounts, calls, messages and Storage buckets.
`20261110151449_connect_fix6_history_barrier.sql` is the only new SQL required.
It was applied to project tpwkmoxxzjfdsqsomhhr in this task under migration name
`connect_fix6_history_barrier`. The earlier `connect_call_response_owner_v1`
was verified as already installed; its call RPC signatures and answer guard remain.
Do not run older broad unified/E2EE/purge migrations as a prerequisite.

Before and after: 310 messages, including 72 already soft-deleted messages.
The additive journal now contains 72 metadata-only deletion events. No message
body, attachment or account was purged or rewritten by this migration.

The journal uses server observation time and a (deleted_at,message_id) cursor.
Authenticated participants can read it; unrelated accounts and anon cannot.
Message IDs retired by this journal cannot be reused. Chat deletion cascades
remove their metadata. Local history clears deliberately keep retirement barriers.
The restrictive call SELECT policy closes a pre-existing permissive-policy OR
that could expose unrelated participants' signaling. It does not change call
creation/answer/finish RPC permissions or service-role access.

## Reapply / rollback

The migration is transaction-safe and idempotent (tested twice in real Postgres
via PGlite). On another project, check schema prerequisites and take a normal
backup, then apply just this migration through the Supabase migration process.
Do not automatically run all older pending migrations from this repository.
The installer YAML stores this file; it does not silently migrate an arbitrary
linked production database.

A client rollback can leave the additive table, triggers, read-only RPC and
restrictive call fence installed. Old clients do not need to know about them.
Do not drop the journal or retired-ID trigger: offline devices would lose the
barrier against stale cache resurrection. If journaling itself must be paused,
stop clients' history sync first, retain the journal, and have a database owner
review a transaction disabling only the deletion-event trigger. Preserve the
retired-ID guard and call participant fence. No destructive automatic down
migration is shipped. No encrypted-message migration or E2EE activation occurs.

## Deployment / remaining acceptance

Deploy the PWA update and install APK 2.2.3. SDP/ICE and ringing/accepted/ended
wire formats remain compatible. The fixed clients capture the submitted answer
before ICE gathering mutates localDescription. Old APKs retain that old bug.

On the existing HTTPS proxy deployment, verify NEXT_PUBLIC_SUPABASE_URL/key,
Firebase Admin credentials for the same Firebase project as the APK, and
CONNECT_TURN_URLS + CONNECT_TURN_SHARED_SECRET for an operating coturn server.
Never put Admin/TURN secrets in client builds. The authenticated /api/calls/ice
endpoint reports relayConfigured; diagnostics also detect TURN in older
responses. STUN alone does not guarantee calls across mobile/symmetric NAT.
No deployment secrets or live TURN relay were available to this task.

A push HTTP 503 now identifies missing transport configuration instead of
reporting silent success. Push attempts retry with bounded deadlines. Android is prioritized and up to four
endpoints are delivered independently; web push has a 6-second timeout, and each
endpoint gets at most two attempts. A slow/invalid VAPID endpoint cannot block FCM. Database
polling remains the foreground fallback, not a replacement for native cold FCM.

Security/performance advisors after migration retain existing notices: server-only
RLS tables deliberately have no client policies; participant-checked call RPCs
are intentionally SECURITY DEFINER. ensure_connect_profile's anon execution and
Auth leaked-password settings require separate account-policy review; unrelated
ACLs were not changed here. New index 'unused' notices are expected immediately
after installation; do not drop cursor/page indexes. Existing unrelated missing
FK indexes and two per-row auth policy calls remain.

Advisor references:
- https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable
- https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable
- https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection
- https://supabase.com/docs/guides/database/database-linter?lint=0001_unindexed_foreign_keys
- https://supabase.com/docs/guides/database/database-linter?lint=0003_auth_rls_initplan

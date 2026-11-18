# Historical maintenance functions

These are schema-audit source snapshots, not deployable application code. The PWA does not call them. The two backfill endpoints are still present on Supabase and use the private GC authorization token; they are deliberately excluded from the remediation deployment. The legacy sticker migrator already returns HTTP 410.

Retain these records until recovery/backfill requirements are independently checked. Do not redeploy them or add their Neon queues to the active PWA. This package neither invokes nor deletes the existing maintenance endpoints.

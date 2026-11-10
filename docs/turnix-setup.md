# Connect — Turnix TURN setup (PWA + native APK)

Connect uses one authenticated `GET /api/calls/ice` endpoint for both PWA and APK 2.2.4. The backend requests per-call, expiring relay credentials from Turnix. **Never put `TURNIX_API_TOKEN` into the APK, PWA, GitHub repository, or any `NEXT_PUBLIC_*` variable.**

1. Create an account at https://turnix.io/signup and choose the free plan (10 GB relayed monthly, trial regions, no credit card per Turnix's published offer).
2. In the Turnix console create a project and a project-scoped API token. Do not send it in chat.
3. In Vercel **connect-messenger → Settings → Environment Variables**, add `TURNIX_API_TOKEN` as **Sensitive** for **Production** only.
4. **Redeploy production** from the latest verified `main` commit (environment changes are not injected into older deployments).
5. Sign in to PWA, then invoke `GET /api/calls/ice` with the existing Supabase access token. Check `relayConfigured: true` and at least one `turn:` or `turns:` URL. Never share the returned `credential` or raw token.
6. Confirm an actual relay ICE candidate and a two-way call between PWA and APK. Test different networks. `GET /api/calls/health` only checks that configuration is present; it does **not** prove working network or successful calls.

Server errors and quota limits fall back to normal STUN/legacy coturn, never leak the token, and log only coarse provider failure information. This does **not** guarantee successful calls across restrictive NAT when the free quota is exhausted. The PWA and APK obtain fresh temporary credentials for each call attempt. Android's incoming-call notifications, FCM, lock-screen call UI, and microphone permission require separate device testing.

Turnix API: https://turnix.io/docs/api-reference/credentials

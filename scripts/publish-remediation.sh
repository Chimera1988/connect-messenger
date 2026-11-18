#!/usr/bin/env bash
set -euo pipefail
if [[ "${CONNECT_VERIFIED:-}" != 'TESTS_AND_BUILD_PASSED' ]]; then
  echo 'Publication refused: validation has not completed.' >&2
  exit 2
fi
: "${CONNECT_PATHS_FILE:?Missing reviewed path list}"
: "${CONNECT_SOURCE_HEAD:?Missing reviewed source head}"
: "${CONNECT_RELEASE_SHA:?Missing payload digest}"
: "${GH_TOKEN:?A token with Contents, Pull requests and Workflows write permissions is required}"
[[ "$GITHUB_REPOSITORY" == 'Chimera1988/connect-messenger' ]]
[[ "$CONNECT_RELEASE_SHA" =~ ^[a-f0-9]{64}$ ]]
git diff --check
gh auth setup-git --hostname github.com
git fetch origin main
[[ "$(git rev-parse origin/main)" == "$CONNECT_SOURCE_HEAD" ]] || { echo 'SOURCE_DRIFT: main advanced during verification' >&2; exit 2; }
git add --pathspec-from-file="$CONNECT_PATHS_FILE" --pathspec-file-nul
if git diff --cached --quiet; then
  echo 'The reviewed remediation is already present; no commit or PR needed.'
  exit 0
fi
branch="remediation/connect-architecture-${CONNECT_RELEASE_SHA:0:12}"
git switch -c "$branch"
git -c user.name='github-actions[bot]' -c user.email='41898282+github-actions[bot]@users.noreply.github.com' commit -m 'refactor: secure Connect sessions and durable messaging architecture'
remote="$(git ls-remote origin "refs/heads/$branch")"
if [[ -n "$remote" ]]; then
  git fetch origin "$branch"
  git diff --exit-code FETCH_HEAD HEAD
else
  git push origin "HEAD:refs/heads/$branch"
fi
body="$RUNNER_TEMP/connect-remediation-pr.md"
cat > "$body" <<'BODY'
Connect now shares verified session ownership, checks revoked sessions in routes/RLS/RPCs, binds push installations to sessions, obtains exact inbox summaries, accounts for cache size without loading every binary, and retries messages/call finishes with stable identities. GC retires paths before deleting bytes; account deletion preserves peer history through an anonymous profile.

Validation: Node 22, all discovered regression/SQL/WebRTC tests, Edge Function typecheck, architecture checks, production build, and mobile Chromium application flow.

Backend deployment is separate. Run the original standalone installer in `backend` mode against the reviewed project after completing a backup, before merging this PWA change. Review `docs/BACKEND.md` and `reports/ARCHITECTURE_REMEDIATION.md`. This preparation run has not modified production data.
BODY
existing="$(gh pr list --base main --head "$branch" --state open --json url --jq '.[0].url')"
if [[ -n "$existing" ]]; then printf '%s\n' "$existing";else
  gh pr create --base main --head "$branch" --title 'Connect: session security and architecture remediation' --body-file "$body"
fi

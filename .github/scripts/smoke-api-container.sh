#!/usr/bin/env bash
# Checks the API container of the Compose profile full: probes, migrations, image contents and a
# graceful stop. Run from anywhere after `docker compose --profile full up -d --wait`.
set -euo pipefail

cd "$(dirname "$0")/../.."

readonly API=http://127.0.0.1:4000
readonly ORIGIN=http://localhost:3000
readonly GRACE_PERIOD_S=15

fail() {
  echo "FAIL: $*" >&2
  exit 1
}

pass() {
  echo "ok: $*"
}

expect_status() {
  local expected=$1 actual=$2 what=$3
  [[ $actual == "$expected" ]] || fail "$what answered $actual, expected $expected"
  pass "$what answered $expected"
}

in_api() {
  docker compose exec -T api sh -c "$1"
}

# A failed request reports 000 and its check fails with a message, instead of a silent exit.
status=$(curl --silent --show-error --output /dev/null --write-out '%{http_code}' \
  "$API/health/ready" || true)
expect_status 200 "$status" 'GET /health/ready'

# A fresh email per run; 201 proves the migrations ran.
email="smoke-$(date +%s)-$RANDOM@example.com"
status=$(curl --silent --show-error --output /dev/null --write-out '%{http_code}' \
  --header 'Content-Type: application/json' --header "Origin: $ORIGIN" \
  --data "{\"email\":\"$email\",\"password\":\"smoke-test-password\",\"name\":\"Smoke Test\",\"workspaceName\":\"Smoke\"}" \
  "$API/api/auth/register" || true)
expect_status 201 "$status" 'POST /api/auth/register'

uid=$(in_api 'id -u')
[[ $uid != 0 ]] || fail 'the API runs as root'
pass "the API runs as uid $uid"

dev_packages=$(in_api 'ls node_modules/.pnpm' | grep -E '^(pino-pretty|vitest)@' || true)
[[ -z $dev_packages ]] || fail "dev dependencies in the image: $dev_packages"
pass 'no dev dependencies in the image'

for path in src test .env node_modules/@clientry/shared/src node_modules/@clientry/shared/test; do
  if in_api "test -e '$path'"; then
    fail "$path is in the image"
  fi
done
pass 'no sources, tests or .env in the API or @clientry/shared'

container=$(docker compose ps --quiet api)
# Only lines written after this point count, so an earlier stop of a reused container cannot pass.
lines_before=$(docker compose logs --no-log-prefix api | wc -l)
started_at=$(date +%s)
docker compose stop api
elapsed_s=$(($(date +%s) - started_at))
exit_code=$(docker inspect --format '{{.State.ExitCode}}' "$container")
[[ $exit_code == 0 ]] || fail "the API exited with $exit_code after SIGTERM"
((elapsed_s < GRACE_PERIOD_S)) || fail "the API took ${elapsed_s}s to stop"
pass "the API stopped with exit code 0 in ${elapsed_s}s"

logs=$(docker compose logs --no-log-prefix api | tail -n "+$((lines_before + 1))")
for line in 'Shutting down' 'Database connections closed' 'Redis connection closed'; do
  grep --quiet --fixed-strings "\"msg\":\"$line\"" <<<"$logs" || fail "no log line \"$line\""
done
pass 'the shutdown lines are logged'

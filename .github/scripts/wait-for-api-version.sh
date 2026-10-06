#!/usr/bin/env bash
# Polls <api>/health/live until it reports <version>, then checks readiness once.
# Usage: wait-for-api-version.sh <api origin> <version>
set -euo pipefail

readonly INTERVAL_S=10
readonly DEADLINE_S=900
readonly REQUEST_TIMEOUT_S=90

if (($# != 2)) || [[ -z $1 || -z $2 ]]; then
  echo "usage: $0 <api origin> <version>" >&2
  exit 2
fi
api=${1%/}
expected=$2

live_version() {
  curl --silent --max-time "$REQUEST_TIMEOUT_S" "$api/health/live" |
    sed -n 's/.*"version":"\([^"]*\)".*/\1/p' || true
}

# The old instance keeps answering with its own version until Render switches traffic.
started_at=$(date +%s)
while true; do
  version=$(live_version)
  if [[ $version == "$expected" ]]; then
    echo "ok: $api serves $expected"
    break
  fi
  if (($(date +%s) - started_at >= DEADLINE_S)); then
    echo "FAIL: $api still serves '${version:-no answer}' after ${DEADLINE_S}s, expected $expected" >&2
    exit 1
  fi
  echo "waiting: $api serves '${version:-no answer}'"
  sleep "$INTERVAL_S"
done

# Once per deploy: the probe wakes Neon.
status=$(curl --silent --output /dev/null --write-out '%{http_code}' \
  --max-time "$REQUEST_TIMEOUT_S" "$api/health/ready" || true)
if [[ $status != 200 ]]; then
  echo "FAIL: $api/health/ready answered ${status:-nothing}" >&2
  exit 1
fi
echo "ok: $api is ready"

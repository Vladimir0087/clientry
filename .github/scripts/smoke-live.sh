#!/usr/bin/env bash
# Checks the live web, its proxy to the API, and the API itself.
# Usage: smoke-live.sh <web origin> <api origin> [<commit>]
set -euo pipefail

# Vercel's proxy waits up to 120 s for an API that is waking up.
readonly REQUEST_TIMEOUT_S=130

if (($# < 2 || $# > 3)) || [[ -z $1 || -z $2 ]]; then
  echo "usage: $0 <web origin> <api origin> [<commit>]" >&2
  exit 2
fi
web=${1%/}
api=${2%/}
commit=${3:-}

failures=0

fail() {
  echo "FAIL: $*" >&2
  failures=$((failures + 1))
}

pass() {
  echo "ok: $*"
}

# Prints the status line and headers, then the body; never follows redirects. A failed request
# prints nothing, so its checks fail and the rest still run.
fetch() {
  curl --silent --show-error --include --max-time "$REQUEST_TIMEOUT_S" "$1" | tr -d '\r' || true
}

status_of() {
  local status
  status=$(head -n 1 <<<"$1" | cut -d ' ' -f 2)
  echo "${status:-no response}"
}

header_of() {
  sed -n '/^$/q;p' <<<"$1" | grep -i "^$2:" | head -n 1 | cut -d ' ' -f 2- || true
}

login=$(fetch "$web/login")
if [[ $(status_of "$login") != 200 ]]; then
  fail "GET $web/login answered $(status_of "$login")"
else
  pass "GET $web/login answered 200"
fi
if [[ $(header_of "$login" content-security-policy) == *"'nonce-"* ]]; then
  pass '/login carries the nonce CSP'
else
  fail '/login has no nonce CSP'
fi
if [[ -n $(header_of "$login" strict-transport-security) ]]; then
  pass '/login carries HSTS'
else
  fail '/login has no HSTS'
fi

home=$(fetch "$web/")
location=$(header_of "$home" location)
if [[ $(status_of "$home") == 30[78] && $location =~ ^(https://[^/]+)?/login([?]|$) ]]; then
  pass "GET $web/ without cookies redirects to /login"
else
  fail "GET $web/ answered $(status_of "$home") with location '${location}'"
fi

openapi=$(fetch "$web/api/docs/openapi.json")
if [[ $(status_of "$openapi") == 200 && $(header_of "$openapi" content-type) == application/json* &&
  $openapi == *'"openapi":'* ]]; then
  pass "GET $web/api/docs/openapi.json reaches the API through the proxy"
else
  fail "GET $web/api/docs/openapi.json answered $(status_of "$openapi")"
fi

live=$(fetch "$api/health/live")
if [[ $(status_of "$live") != 200 ]]; then
  fail "GET $api/health/live answered $(status_of "$live")"
elif [[ -n $commit && $live != *"\"version\":\"$commit\""* ]]; then
  fail "GET $api/health/live does not report $commit"
else
  pass "GET $api/health/live answered 200${commit:+ with version $commit}"
fi

if ((failures > 0)); then
  echo "$failures check(s) failed" >&2
  exit 1
fi

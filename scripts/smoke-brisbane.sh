#!/usr/bin/env bash
set -euo pipefail
BASE="${BASE:-https://tmbot3000.onrender.com}"
MID="${MID:-#700001}"
q=(
  "when do doors open in brisbane"
  "what is the on-stage time in brisbane"
  "what time is soundcheck in brisbane"
  "what time is load in in brisbane"
  "what time is load out in brisbane"
  "when is curfew in brisbane"
  "what time is lobby call in brisbane"
  "what time is departure in brisbane"
  "what time is airport call in brisbane"
  "what time is band call in brisbane"
  "what time is checkout in brisbane"
  "what time is crew call in brisbane"
  "what is the set length in brisbane"
  "what are the set times in brisbane"
)
green=$'\033[32m'; red=$'\033[31m'; reset=$'\033[0m'
for s in "${q[@]}"; do
  resp="$(curl -sS -X POST "$BASE/api/chat/message" -H 'Content-Type: application/json' -d "{\"memberId\":\"$MID\",\"content\":\"$s\"}")"
  t=$(printf '%s' "$resp" | jq -r '.aiResponse.type // ""')
  txt=$(printf '%s' "$resp" | jq -r '.aiResponse.text // ""')
  if [[ "$t" == "schedule" ]]; then
    printf "%b✓%b %s\n" "$green" "$reset" "$txt"
  else
    printf "%b✗%b %s\n" "$red" "$reset" "$s"
    printf "   %s\n" "$txt"
  fi
done

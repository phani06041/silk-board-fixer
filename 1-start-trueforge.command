#!/bin/bash
# Double-click me. Starts TrueForge and keeps it running. Leave this window open.
cd "$(dirname "$0")"
echo "🚦 Starting TrueForge on http://localhost:8790 ... leave this window open."
echo "   First time: Settings → Models → add TrueFoundry (gateway URL + your token)."
( for i in $(seq 1 60); do curl -s -o /dev/null http://localhost:8790/ && break; sleep 2; done; open "http://localhost:8790" ) &
npx -y @truefoundry/trueforge@latest

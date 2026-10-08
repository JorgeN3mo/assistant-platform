#!/usr/bin/env bash
set -euo pipefail
systemctl is-enabled openclaw-gateway.service
systemctl is-active openclaw-gateway.service
/opt/ai-platform/scripts/openclaw-admin.sh gateway health --json | python3 -c 'import json,sys; d=json.load(sys.stdin); print("Gateway OK:",d.get("ok")); sys.exit(0 if d.get("ok") else 1)'
df -h /data

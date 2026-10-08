#!/usr/bin/env bash
set -euo pipefail
sudo systemctl restart openclaw-gateway.service
for attempt in {1..15}; do
 if /opt/ai-platform/scripts/openclaw-admin.sh gateway health --json 2>/dev/null | python3 -c 'import json,sys; sys.exit(0 if json.load(sys.stdin).get("ok") else 1)' 2>/dev/null; then
  echo 'OpenClaw responde correctamente.'
  exit 0
 fi
 sleep 2
done
echo 'OpenClaw no responde. Consultar: sudo journalctl -u openclaw-gateway.service -n 50' >&2
exit 1

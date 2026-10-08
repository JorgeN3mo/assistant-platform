#!/usr/bin/env bash
set -euo pipefail
if [[ ! -t 0 ]]; then
  echo 'Ejecuta este comando desde una terminal interactiva.' >&2
  exit 1
fi
sudo -u openclaw python3 /opt/ai-platform/scripts/save-liki-token.py
/opt/ai-platform/scripts/openclaw-admin.sh config patch --stdin <<'JSON'
{"channels":{"telegram":{"enabled":true,"accounts":{"liki":{"enabled":true}}}}}
JSON
/opt/ai-platform/scripts/restart-openclaw.sh
/opt/ai-platform/scripts/openclaw-admin.sh channels status --channel telegram --probe
echo 'Ahora abre Liki en Telegram y envía /start para solicitar acceso.'

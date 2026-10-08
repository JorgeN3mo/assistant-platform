#!/usr/bin/env bash
set -euo pipefail
exec sudo -u openclaw env HOME=/data/openclaw OPENCLAW_STATE_DIR=/data/openclaw/state OPENCLAW_CONFIG_PATH=/data/openclaw/state/openclaw.json PATH=/opt/ai-platform/openclaw/runtime/tools/node/bin:/usr/local/bin:/usr/bin:/bin /opt/ai-platform/openclaw/runtime/bin/openclaw "$@"

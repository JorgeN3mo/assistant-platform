#!/usr/bin/env bash
# Run on MiniGUN after reviewing and pulling the Git commit.
set -euo pipefail
[[ $EUID == 0 ]] || { echo 'Ejecutar con sudo en MiniGUN.' >&2; exit 1; }
repo=/opt/ai-platform
config=/data/openclaw/state/openclaw.json
dropin=/etc/systemd/system/openclaw-gateway.service.d/liquidator.conf
backup=$(mktemp -d /data/openclaw/state/liquidator-deploy-XXXXXXXX)
chmod 700 "$backup"
cp -p "$config" "$backup/openclaw.json"
if [[ -f $dropin ]]; then cp -p "$dropin" "$backup/liquidator.conf"; fi
old_mode=$(stat -c %a /data/liquidator)
old_group=$(stat -c %g /data/liquidator)
rollback() {
  result=$?
  if [[ $result != 0 ]]; then
    cp -p "$backup/openclaw.json" "$config"
    if [[ -f $backup/liquidator.conf ]]; then cp -p "$backup/liquidator.conf" "$dropin"; else rm -f "$dropin"; fi
    chgrp "$old_group" /data/liquidator
    chmod "$old_mode" /data/liquidator
    systemctl daemon-reload
    systemctl restart openclaw-gateway.service
    echo "Despliegue fallido; configuración anterior restaurada. Copia privada: $backup" >&2
  fi
  exit "$result"
}
trap rollback EXIT
systemctl stop openclaw-gateway.service
chgrp openclaw /data/liquidator
chmod 710 /data/liquidator
install -d -o openclaw -g openclaw -m 700 /data/liquidator/runtime /data/liquidator/invoices
install -d -m 755 "$(dirname "$dropin")"
install -m 644 "$repo/openclaw/liquidator.conf" "$dropin"
"$repo/scripts/openclaw-admin.sh" plugins install --link "$repo/projects/liquidator/openclaw-plugin" --force --no-enable
python3 - "$config" <<'PY'
import json, os, sys, tempfile
p = sys.argv[1]
with open(p) as f:
    cfg = json.load(f)
plugins = cfg.setdefault('plugins', {})
entry = plugins.setdefault('entries', {}).setdefault('liquidator', {})
entry.update(enabled=True, hooks={'allowConversationAccess': True, 'allowPromptInjection': False}, config={
    'dataDir': '/data/liquidator', 'mediaRoot': '/data/openclaw/state/media',
    'accountId': 'liki', 'maxBytes': 10485760, 'dailyLimit': 30, 'extractionEnabled': True})
if 'allow' in plugins and 'liquidator' not in plugins['allow']:
    plugins['allow'].append('liquidator')
if 'liquidator' in plugins.get('deny', []):
    raise SystemExit('Liquidator está denegado explícitamente; revisar política antes de activar.')
tg = cfg['channels']['telegram']
account = tg['accounts']['liki']
assert tg['dmPolicy'] == account['dmPolicy'] == 'allowlist'
assert tg.get('allowFrom') and account.get('allowFrom'), 'Se exige acceso restringido ya aplicado'
account.setdefault('capabilities', {})['inlineButtons'] = 'allowlist'
st = os.stat(p)
fd, temporary = tempfile.mkstemp(dir=os.path.dirname(p), prefix='.liquidator-config-')
with os.fdopen(fd, 'w') as f:
    json.dump(cfg, f, indent=2)
    f.write('\n'); f.flush(); os.fsync(f.fileno())
os.chown(temporary, st.st_uid, st.st_gid)
os.chmod(temporary, 0o600)
os.replace(temporary, p)
PY
"$repo/scripts/openclaw-admin.sh" config validate
systemctl daemon-reload
"$repo/scripts/restart-openclaw.sh"
echo "Liquidator activado. Copia de configuración privada: $backup"

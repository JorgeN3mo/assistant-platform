#!/usr/bin/env python3
"""Private JSON user registry and explicit OpenClaw access synchronization."""
import argparse
from contextlib import contextmanager
import fcntl
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import tempfile
import time

DATA = Path('/data/liquidator')
ADMIN = '/opt/ai-platform/scripts/openclaw-admin.sh'
STATES = {'pendiente', 'activo', 'bloqueado'}
ROLES = {'admin', 'usuario'}
FIELDS = {'telegram_id', 'nombre', 'estado', 'rol', 'datos_informes'}
REPORT_FIELDS = {'nombre_completo', 'identificacion_fiscal', 'empresa'}


class RegistryError(Exception):
    pass


def identifier(value):
    if not isinstance(value, str) or not re.fullmatch(r'[1-9][0-9]{0,18}', value):
        raise RegistryError('El identificador debe ser el ID numérico positivo de Telegram.')
    if int(value) > 2**63 - 1:
        raise RegistryError('ID de Telegram fuera de rango.')
    return value


def unique_object(pairs):
    result = {}
    for key, value in pairs:
        if key in result:
            raise RegistryError('El JSON contiene claves duplicadas.')
        result[key] = value
    return result


def load_json(path):
    if path.is_symlink() or not path.is_file():
        raise RegistryError(f'Archivo ausente o enlace no permitido: {path.name}')
    try:
        return json.loads(path.read_text(), object_pairs_hook=unique_object)
    except (ValueError, UnicodeError) as error:
        raise RegistryError(f'JSON no válido: {path}') from error


def validate(profile, expected_id):
    if not isinstance(profile, dict) or set(profile) != FIELDS:
        raise RegistryError('El perfil debe contener telegram_id, nombre, estado, rol y datos_informes.')
    if identifier(profile['telegram_id']) != expected_id:
        raise RegistryError('El telegram_id no coincide con la carpeta del usuario.')
    if not isinstance(profile['nombre'], str) or not 1 <= len(profile['nombre'].strip()) <= 200:
        raise RegistryError('El nombre debe ser un texto de 1 a 200 caracteres.')
    if not isinstance(profile['estado'], str) or profile['estado'] not in STATES:
        raise RegistryError('Estado no válido: usar pendiente, activo o bloqueado.')
    if not isinstance(profile['rol'], str) or profile['rol'] not in ROLES:
        raise RegistryError('Rol no válido: usar admin o usuario.')
    reports = profile['datos_informes']
    if not isinstance(reports, dict) or set(reports) != REPORT_FIELDS:
        raise RegistryError('datos_informes debe contener nombre_completo, identificacion_fiscal y empresa.')
    if any(not isinstance(v, str) or len(v) > 500 for v in reports.values()):
        raise RegistryError('Los datos para informes deben ser textos de hasta 500 caracteres.')
    return profile


def atomic_json(path, value):
    if path.is_symlink() or path.parent.is_symlink():
        raise RegistryError('No se permiten enlaces en el registro.')
    fd, temporary = tempfile.mkstemp(prefix='.profile-', dir=path.parent)
    try:
        with os.fdopen(fd, 'w') as stream:
            json.dump(value, stream, ensure_ascii=False, indent=2)
            stream.write('\n')
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temporary, path)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)


class Registry:
    def __init__(self, data=DATA):
        self.data = Path(data)
        self.users = self.data / 'users'

    @contextmanager
    def locked(self):
        if self.data.is_symlink() or self.users.is_symlink():
            raise RegistryError('El directorio de usuarios no puede ser un enlace.')
        if not self.data.is_dir() or not self.users.is_dir():
            raise RegistryError('No existe el directorio de usuarios.')
        lock = self.data / '.users.lock'
        fd = os.open(lock, os.O_CREAT | os.O_RDWR | os.O_NOFOLLOW, 0o600)
        with os.fdopen(fd, 'w') as stream:
            fcntl.flock(stream, fcntl.LOCK_EX)
            yield

    def read(self):
        profiles = []
        for folder in sorted(self.users.iterdir()):
            if folder.name.startswith('.'):
                continue
            identifier(folder.name)
            if folder.is_symlink() or not folder.is_dir():
                raise RegistryError('Cada usuario debe tener una carpeta numérica sin enlaces.')
            profiles.append(validate(load_json(folder / 'profile.json'), folder.name))
        return profiles

    def add(self, user_id, name, role='usuario'):
        identifier(user_id)
        profile = {'telegram_id': user_id, 'nombre': name, 'estado': 'pendiente',
                   'rol': role, 'datos_informes': {k: '' for k in sorted(REPORT_FIELDS)}}
        validate(profile, user_id)
        folder = self.users / user_id
        if folder.exists() or folder.is_symlink():
            raise RegistryError('El usuario ya existe; no se sobrescribe su perfil.')
        folder.mkdir(mode=0o700)
        atomic_json(folder / 'profile.json', profile)

    def change(self, user_id, state):
        identifier(user_id)
        self.read()  # Validate the complete registry before making edits.
        path = self.users / user_id / 'profile.json'
        profile = validate(load_json(path), user_id)
        profile['estado'] = state
        atomic_json(path, profile)


def access_patch(profiles):
    allowed = sorted((p['telegram_id'] for p in profiles if p['estado'] == 'activo'), key=int)
    policy = {'dmPolicy': 'allowlist' if allowed else 'disabled', 'allowFrom': allowed,
              'groupPolicy': 'disabled', 'configWrites': False}
    return {'channels': {'telegram': dict(policy, accounts={'liki': dict(policy)})}}


def access_matches(config, patch):
    telegram = config.get('channels', {}).get('telegram', {})
    target = patch['channels']['telegram']
    for source, expected in [(telegram, target),
                             (telegram.get('accounts', {}).get('liki', {}), target['accounts']['liki'])]:
        if any(source.get(k) != expected[k] for k in ['dmPolicy', 'allowFrom', 'groupPolicy', 'configWrites']):
            return False
    return True


def call_admin(arguments, value=None):
    result = subprocess.run([ADMIN] + arguments,
                            input=json.dumps(value) if value is not None else None,
                            text=True, capture_output=True, timeout=45)
    if result.returncode:
        # Do not echo arbitrary provider output or private configuration.
        raise RegistryError('OpenClaw no pudo completar la operación: ' + ' '.join(arguments[:2]))
    return result.stdout


def gateway_config():
    result = json.loads(call_admin(['gateway', 'call', 'config.get', '--json']))
    if not result.get('valid'):
        raise RegistryError('La configuración actual de OpenClaw no es válida.')
    config = result.get('runtimeConfig') or result.get('config')
    if not isinstance(config, dict):
        raise RegistryError('No se pudo leer la configuración cargada de OpenClaw.')
    return result, config


def apply_registry(registry, preview=False):
    profiles = registry.read()
    patch = access_patch(profiles)
    _, current = gateway_config()
    accounts = current.get('channels', {}).get('telegram', {}).get('accounts', {})
    if set(accounts) != {'liki'}:
        raise RegistryError('Esta herramienta requiere que Liki sea la única cuenta Telegram; revisar antes de sincronizar otras cuentas.')
    call_admin(['config', 'patch', '--stdin', '--dry-run'], patch)
    active = patch['channels']['telegram']['allowFrom']
    print('Usuarios que tendrán acceso:', ', '.join(active) or 'ninguno (bot cerrado)')
    if preview:
        print('Vista previa: no se han cambiado permisos.')
        return
    if registry.read() != profiles:
        raise RegistryError('Los perfiles cambiaron durante la validación. Vuelve a aplicar.')
    call_admin(['config', 'patch', '--stdin'], patch)
    for attempt in range(6):
        result, loaded = gateway_config()
        hashes_match = (result.get('configRevisionHash') is not None and
                        result.get('configRevisionHash') == result.get('appliedConfigHash'))
        if hashes_match and access_matches(loaded, patch):
            break
        if attempt == 5:
            raise RegistryError('Configuración escrita, pero no se confirmó su carga. Revisa el servicio y vuelve a aplicar.')
        time.sleep(1)
    if registry.read() != profiles:
        raise RegistryError('Los perfiles cambiaron durante la aplicación. Vuelve a aplicar para sincronizarlos.')
    digest = hashlib.sha256(json.dumps(profiles, sort_keys=True).encode()).hexdigest()
    atomic_json(registry.data / 'users-access.json', {'active_telegram_ids': active,
                'profiles_sha256': digest, 'applied_at_utc': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())})
    print('Acceso aplicado y confirmado en OpenClaw. Luna y los demás controles no se modifican.')


def main():
    parser = argparse.ArgumentParser(description='Gestionar perfiles JSON privados de Liki.')
    sub = parser.add_subparsers(dest='command', required=True)
    sub.add_parser('listar')
    add = sub.add_parser('anadir')
    add.add_argument('telegram_id')
    add.add_argument('--nombre', required=True)
    add.add_argument('--rol', choices=sorted(ROLES), default='usuario')
    for name in ['activar', 'bloquear', 'pendiente']:
        sub.add_parser(name).add_argument('telegram_id')
    sub.add_parser('validar')
    apply = sub.add_parser('aplicar')
    apply.add_argument('--simular', action='store_true')
    args = parser.parse_args()
    registry = Registry()
    with registry.locked():
        if args.command == 'anadir':
            registry.read()
            registry.add(args.telegram_id, args.nombre, args.rol)
            print('Perfil creado como pendiente; todavía no tiene acceso.')
        elif args.command in {'activar', 'bloquear', 'pendiente'}:
            state = {'activar': 'activo', 'bloquear': 'bloqueado', 'pendiente': 'pendiente'}[args.command]
            registry.change(args.telegram_id, state)
            print('Perfil actualizado. Ejecuta usuarios.sh aplicar para cambiar el acceso efectivo.')
        elif args.command == 'listar':
            print('TELEGRAM_ID\tESTADO\tROL\tNOMBRE')
            for p in registry.read():
                print('\t'.join(p[k].replace('\t', ' ').replace('\n', ' ') for k in ['telegram_id', 'estado', 'rol', 'nombre']))
        elif args.command == 'validar':
            print(f'{len(registry.read())} perfiles válidos.')
        elif args.command == 'aplicar':
            apply_registry(registry, args.simular)


if __name__ == '__main__':
    try:
        main()
    except (RegistryError, OSError, ValueError, subprocess.TimeoutExpired) as error:
        print('Error: ' + str(error), file=sys.stderr)
        sys.exit(1)

import copy
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

import users


class UserAccessTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.data = Path(self.temp.name)
        (self.data / 'users').mkdir()
        self.registry = users.Registry(self.data)

    def add(self, user_id, state='pendiente', role='usuario'):
        self.registry.add(user_id, 'Usuario de prueba', role)
        self.registry.change(user_id, state)

    def test_only_active_users_allowed_regardless_of_role(self):
        self.add('101', 'activo')
        self.add('102', 'pendiente', 'admin')
        self.add('103', 'bloqueado')
        p = users.access_patch(self.registry.read())
        telegram = p['channels']['telegram']
        self.assertEqual(telegram['allowFrom'], ['101'])
        self.assertEqual(telegram['accounts']['liki']['allowFrom'], ['101'])
        self.assertNotIn('commands', p)  # Application roles never grant command ownership.
        self.assertNotIn('agents', p)  # Model and tool restrictions are untouched.

    def test_no_active_users_closes_bot(self):
        self.add('101')
        p = users.access_patch(self.registry.read())['channels']['telegram']
        self.assertEqual(p['dmPolicy'], 'disabled')
        self.assertEqual(p['accounts']['liki']['dmPolicy'], 'disabled')
        self.assertEqual(p['allowFrom'], [])

    def test_invalid_json_does_not_invoke_openclaw(self):
        self.add('101', 'activo')
        (self.data / 'users/101/profile.json').write_text('{broken')
        with patch('users.call_admin') as call:
            with self.assertRaises(users.RegistryError):
                users.apply_registry(self.registry)
            call.assert_not_called()

    def test_duplicate_json_keys_rejected(self):
        self.add('101')
        p = self.data / 'users/101/profile.json'
        p.write_text('{"telegram_id":"101","telegram_id":"102"}')
        with self.assertRaises(users.RegistryError):
            self.registry.read()

    def test_identity_must_match_directory(self):
        self.add('101')
        path = self.data / 'users/101/profile.json'
        p = json.loads(path.read_text())
        p['telegram_id'] = '102'
        users.atomic_json(path, p)
        with self.assertRaises(users.RegistryError):
            self.registry.read()

    def test_duplicate_add_preserves_existing_profile(self):
        self.add('101', 'activo')
        before = self.registry.read()
        with self.assertRaises(users.RegistryError):
            self.registry.add('101', 'Otro nombre')
        self.assertEqual(self.registry.read(), before)

    def test_symlink_profile_and_path_traversal_rejected(self):
        self.add('101')
        path = self.data / 'users/101/profile.json'
        path.unlink()
        path.symlink_to(self.data / 'external.json')
        with self.assertRaises(users.RegistryError):
            self.registry.read()
        with self.assertRaises(users.RegistryError):
            self.registry.add('../outside', 'Nombre')

    def test_private_permissions(self):
        self.add('101')
        self.assertEqual((self.data / 'users/101').stat().st_mode & 0o777, 0o700)
        self.assertEqual((self.data / 'users/101/profile.json').stat().st_mode & 0o777, 0o600)

    def test_preview_and_apply_validate_then_verify_runtime(self):
        self.add('101', 'activo')
        desired = users.access_patch(self.registry.read())
        config = {'channels': {'telegram': {'accounts': {'liki': {}}}}}
        calls = []

        def fake(arguments, value=None):
            calls.append((arguments, value))
            if arguments[:2] == ['gateway', 'call']:
                return json.dumps({'valid': True, 'runtimeConfig': config,
                                   'configRevisionHash': 'new', 'appliedConfigHash': 'new'})
            if '--dry-run' not in arguments:
                config['channels'] = copy.deepcopy(value['channels'])
            return '{}'

        with patch('users.call_admin', side_effect=fake):
            users.apply_registry(self.registry, preview=True)
            self.assertFalse((self.data / 'users-access.json').exists())
            self.assertTrue(all('--dry-run' in a for a, v in calls if v is not None))
            users.apply_registry(self.registry)
        self.assertTrue(users.access_matches(config, desired))
        self.assertEqual(json.loads((self.data / 'users-access.json').read_text())['active_telegram_ids'], ['101'])

    def test_rejects_shared_telegram_root_with_other_accounts(self):
        self.add('101', 'activo')
        config = {'channels': {'telegram': {'accounts': {'liki': {}, 'other': {}}}}}
        with patch('users.gateway_config', return_value=({}, config)), patch('users.call_admin') as call:
            with self.assertRaises(users.RegistryError):
                users.apply_registry(self.registry)
            call.assert_not_called()

    def test_failed_runtime_reload_never_records_success(self):
        self.add('101', 'activo')
        config = {'channels': {'telegram': {'accounts': {'liki': {}}}}}
        with patch('users.gateway_config', return_value=({'configRevisionHash': 'new', 'appliedConfigHash': 'old'}, config)), patch('users.call_admin'), patch('users.time.sleep'):
            with self.assertRaises(users.RegistryError):
                users.apply_registry(self.registry)
        self.assertFalse((self.data / 'users-access.json').exists())


if __name__ == '__main__':
    unittest.main()

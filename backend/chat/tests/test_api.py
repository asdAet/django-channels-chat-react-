
"""Содержит тесты модуля `test_api` подсистемы `chat`."""


import json
from urllib.parse import parse_qs, urlparse
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.db import OperationalError
from django.test import Client, RequestFactory, SimpleTestCase, TestCase, override_settings

from chat import api, utils
from chat.models import ChatRole, Message, Room

User = get_user_model()


class _BrokenProfileValue:
    """Группирует тестовые сценарии класса `_BrokenProfileValue`."""
    @property
    def url(self):
        """Проверяет сценарий `url`."""
        raise ValueError('bad value')

    def __str__(self):
        """Проверяет сценарий `__str__`."""
        return 'profile_pics/fallback.jpg'


class ChatApiHelpersTests(SimpleTestCase):
    """Группирует тестовые сценарии класса `ChatApiHelpersTests`."""
    def setUp(self):
        """Проверяет сценарий `setUp`."""
        self.factory = RequestFactory()

    def test_build_profile_pic_url_returns_none_for_empty(self):
        """Проверяет сценарий `test_build_profile_pic_url_returns_none_for_empty`."""
        request = self.factory.get('/api/chat/public-room/')
        self.assertIsNone(api._build_profile_pic_url(request, None))

    @override_settings(PUBLIC_BASE_URL='https://example.com', MEDIA_URL='/media/')
    def test_build_profile_pic_url_falls_back_to_string_value(self):
        """Проверяет сценарий `test_build_profile_pic_url_falls_back_to_string_value`."""
        request = self.factory.get('/api/chat/public-room/')
        url = api._build_profile_pic_url(request, _BrokenProfileValue())
        parsed = urlparse(url)
        self.assertEqual(f"{parsed.scheme}://{parsed.netloc}", "https://example.com")
        self.assertEqual(parsed.path, "/api/auth/media/profile_pics/fallback.jpg")
        query = parse_qs(parsed.query)
        self.assertIn("exp", query)
        self.assertIn("sig", query)
        self.assertTrue(
            utils.is_valid_media_signature(
                "profile_pics/fallback.jpg",
                int(query["exp"][0]),
                query["sig"][0],
            )
        )

    @override_settings(CHAT_ROOM_SLUG_REGEX='[')
    def test_is_valid_room_slug_handles_invalid_regex(self):
        """Проверяет сценарий `test_is_valid_room_slug_handles_invalid_regex`."""
        self.assertFalse(api._is_valid_room_slug('room-name'))

    @override_settings(CHAT_DIRECT_SLUG_SALT='salt-one')
    def test_direct_room_slug_is_deterministic_for_same_salt(self):
        """Проверяет детерминированность slug для одной пары и одного salt."""
        first = api._direct_room_slug('1:2')
        second = api._direct_room_slug('1:2')
        self.assertEqual(first, second)

    def test_direct_room_slug_changes_when_salt_changes(self):
        """Проверяет, что slug зависит от секретного salt."""
        with override_settings(CHAT_DIRECT_SLUG_SALT='salt-a'):
            first = api._direct_room_slug('1:2')
        with override_settings(CHAT_DIRECT_SLUG_SALT='salt-b'):
            second = api._direct_room_slug('1:2')
        self.assertNotEqual(first, second)

    def test_parse_positive_int_raises_for_invalid_value(self):
        """Проверяет сценарий `test_parse_positive_int_raises_for_invalid_value`."""
        with self.assertRaises(ValueError):
            api._parse_positive_int('bad', 'limit')

    def test_public_room_returns_fallback_when_db_unavailable(self):
        """Проверяет сценарий `test_public_room_returns_fallback_when_db_unavailable`."""
        with patch('chat.api.Room.objects.get_or_create', side_effect=OperationalError):
            room = api._public_room()
        self.assertEqual(room.slug, 'public')
        self.assertEqual(room.name, 'Public Chat')


class RoomDetailsApiTests(TestCase):
    """Группирует тестовые сценарии класса `RoomDetailsApiTests`."""
    def setUp(self):
        """Проверяет сценарий `setUp`."""
        self.client = Client()
        self.owner = User.objects.create_user(username='owner', password='pass12345')
        self.member = User.objects.create_user(username='member', password='pass12345')
        self.other = User.objects.create_user(username='other', password='pass12345')

    def _create_private_room(self, slug='private123'):
        """Проверяет сценарий `_create_private_room`."""
        room = Room.objects.create(slug=slug, name='private room', kind=Room.Kind.PRIVATE, created_by=self.owner)
        ChatRole.objects.create(
            room=room,
            user=self.owner,
            role=ChatRole.Role.OWNER,
            username_snapshot=self.owner.username,
            granted_by=self.owner,
        )
        return room

    def test_public_room_details(self):
        """Проверяет сценарий `test_public_room_details`."""
        response = self.client.get('/api/chat/rooms/public/')
        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload['slug'], 'public')
        self.assertEqual(payload['kind'], Room.Kind.PUBLIC)

    def test_invalid_private_slug_returns_400(self):
        """Проверяет сценарий `test_invalid_private_slug_returns_400`."""
        response = self.client.get('/api/chat/rooms/bad%2Fslug/')
        self.assertEqual(response.status_code, 400)

    def test_private_room_for_guest_returns_404(self):
        """Проверяет сценарий `test_private_room_for_guest_returns_404`."""
        self._create_private_room()
        response = self.client.get('/api/chat/rooms/private123/')
        self.assertEqual(response.status_code, 404)

    def test_private_room_created_for_authenticated_user(self):
        """Проверяет сценарий `test_private_room_created_for_authenticated_user`."""
        self.client.force_login(self.owner)

        response = self.client.get('/api/chat/rooms/newroom123/')
        self.assertEqual(response.status_code, 200)
        payload = response.json()

        self.assertTrue(payload['created'])
        self.assertEqual(payload['kind'], Room.Kind.PRIVATE)
        self.assertEqual(payload['createdBy'], self.owner.username)
        room = Room.objects.get(slug='newroom123')
        self.assertTrue(
            ChatRole.objects.filter(room=room, user=self.owner, role=ChatRole.Role.OWNER).exists()
        )

    def test_existing_private_room_denies_non_member(self):
        """Проверяет сценарий `test_existing_private_room_denies_non_member`."""
        self._create_private_room()
        self.client.force_login(self.other)

        response = self.client.get('/api/chat/rooms/private123/')
        self.assertEqual(response.status_code, 404)

    def test_existing_private_room_allows_member(self):
        """Проверяет сценарий `test_existing_private_room_allows_member`."""
        room = self._create_private_room()
        ChatRole.objects.create(
            room=room,
            user=self.member,
            role=ChatRole.Role.MEMBER,
            username_snapshot=self.member.username,
            granted_by=self.owner,
        )
        self.client.force_login(self.member)

        response = self.client.get('/api/chat/rooms/private123/')
        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertFalse(payload['created'])

    def test_direct_room_details_returns_peer(self):
        """Проверяет сценарий `test_direct_room_details_returns_peer`."""
        room = Room.objects.create(
            slug='dm_abc123',
            name='dm',
            kind=Room.Kind.DIRECT,
            direct_pair_key=f'{self.owner.id}:{self.member.id}',
            created_by=self.owner,
        )
        ChatRole.objects.create(
            room=room,
            user=self.owner,
            role=ChatRole.Role.OWNER,
            username_snapshot=self.owner.username,
            granted_by=self.owner,
        )
        ChatRole.objects.create(
            room=room,
            user=self.member,
            role=ChatRole.Role.MEMBER,
            username_snapshot=self.member.username,
            granted_by=self.owner,
        )

        self.client.force_login(self.owner)
        response = self.client.get(f'/api/chat/rooms/{room.slug}/')
        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload['kind'], Room.Kind.DIRECT)
        self.assertEqual(payload['peer']['username'], self.member.username)
        self.assertIn('lastSeen', payload['peer'])

    def test_direct_room_denies_non_member(self):
        """Проверяет сценарий `test_direct_room_denies_non_member`."""
        room = Room.objects.create(
            slug='dm_abc123',
            name='dm',
            kind=Room.Kind.DIRECT,
            direct_pair_key=f'{self.owner.id}:{self.member.id}',
            created_by=self.owner,
        )
        ChatRole.objects.create(
            room=room,
            user=self.owner,
            role=ChatRole.Role.OWNER,
            username_snapshot=self.owner.username,
            granted_by=self.owner,
        )
        ChatRole.objects.create(
            room=room,
            user=self.member,
            role=ChatRole.Role.MEMBER,
            username_snapshot=self.member.username,
            granted_by=self.owner,
        )

        self.client.force_login(self.other)
        response = self.client.get(f'/api/chat/rooms/{room.slug}/')
        self.assertEqual(response.status_code, 404)


class RoomMessagesApiTests(TestCase):
    """Группирует тестовые сценарии класса `RoomMessagesApiTests`."""
    def setUp(self):
        """Проверяет сценарий `setUp`."""
        self.client = Client(enforce_csrf_checks=True)
        self.owner = User.objects.create_user(username='owner', password='pass12345')
        self.member = User.objects.create_user(username='member', password='pass12345')
        self.other = User.objects.create_user(username='other', password='pass12345')

    def _create_private_room(self, slug='private123'):
        """Проверяет сценарий `_create_private_room`."""
        room = Room.objects.create(slug=slug, name='private room', kind=Room.Kind.PRIVATE, created_by=self.owner)
        ChatRole.objects.create(
            room=room,
            user=self.owner,
            role=ChatRole.Role.OWNER,
            username_snapshot=self.owner.username,
            granted_by=self.owner,
        )
        return room

    def _create_direct_room(self, slug='dm_abc123'):
        """Проверяет сценарий `_create_direct_room`."""
        room = Room.objects.create(
            slug=slug,
            name='dm',
            kind=Room.Kind.DIRECT,
            direct_pair_key=f'{self.owner.id}:{self.member.id}',
            created_by=self.owner,
        )
        ChatRole.objects.create(
            room=room,
            user=self.owner,
            role=ChatRole.Role.OWNER,
            username_snapshot=self.owner.username,
            granted_by=self.owner,
        )
        ChatRole.objects.create(
            room=room,
            user=self.member,
            role=ChatRole.Role.MEMBER,
            username_snapshot=self.member.username,
            granted_by=self.owner,
        )
        return room

    def _create_messages(self, total: int, room_slug: str = 'public'):
        """Проверяет сценарий `_create_messages`."""
        for i in range(total):
            Message.objects.create(
                username='legacy_name',
                user=self.owner,
                room=room_slug,
                message_content=f'message-{i}',
                profile_pic='profile_pics/legacy.jpg',
            )

    @override_settings(CHAT_MESSAGES_PAGE_SIZE=50, CHAT_MESSAGES_MAX_PAGE_SIZE=200)
    def test_room_messages_default_pagination(self):
        """Проверяет сценарий `test_room_messages_default_pagination`."""
        self._create_messages(60)

        response = self.client.get('/api/chat/rooms/public/messages/')
        self.assertEqual(response.status_code, 200)
        payload = response.json()

        self.assertEqual(len(payload['messages']), 50)
        self.assertTrue(payload['pagination']['hasMore'])
        self.assertEqual(payload['pagination']['limit'], 50)
        self.assertEqual(payload['pagination']['nextBefore'], payload['messages'][0]['id'])

    @override_settings(CHAT_MESSAGES_PAGE_SIZE=10, CHAT_MESSAGES_MAX_PAGE_SIZE=20)
    def test_room_messages_limit_is_capped_by_max_page_size(self):
        """Проверяет сценарий `test_room_messages_limit_is_capped_by_max_page_size`."""
        self._create_messages(30)

        response = self.client.get('/api/chat/rooms/public/messages/?limit=999')
        self.assertEqual(response.status_code, 200)
        payload = response.json()

        self.assertEqual(payload['pagination']['limit'], 20)
        self.assertEqual(len(payload['messages']), 20)

    def test_private_room_messages_require_membership(self):
        """Проверяет сценарий `test_private_room_messages_require_membership`."""
        room = self._create_private_room()
        Message.objects.create(username=self.owner.username, user=self.owner, room=room.slug, message_content='hello')

        response = self.client.get(f'/api/chat/rooms/{room.slug}/messages/')
        self.assertEqual(response.status_code, 404)

    def test_private_room_messages_allow_member(self):
        """Проверяет сценарий `test_private_room_messages_allow_member`."""
        room = self._create_private_room()
        ChatRole.objects.create(
            room=room,
            user=self.member,
            role=ChatRole.Role.MEMBER,
            username_snapshot=self.member.username,
            granted_by=self.owner,
        )
        Message.objects.create(username=self.owner.username, user=self.owner, room=room.slug, message_content='hello')

        self.client.force_login(self.member)
        response = self.client.get(f'/api/chat/rooms/{room.slug}/messages/')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.json()['messages']), 1)

    def test_direct_room_messages_deny_outsider(self):
        """Проверяет сценарий `test_direct_room_messages_deny_outsider`."""
        room = self._create_direct_room()
        Message.objects.create(username=self.owner.username, user=self.owner, room=room.slug, message_content='hello')

        self.client.force_login(self.other)
        response = self.client.get(f'/api/chat/rooms/{room.slug}/messages/')
        self.assertEqual(response.status_code, 404)

    def test_direct_room_messages_allow_participant(self):
        """Проверяет сценарий `test_direct_room_messages_allow_participant`."""
        room = self._create_direct_room()
        Message.objects.create(username=self.owner.username, user=self.owner, room=room.slug, message_content='hello')

        self.client.force_login(self.member)
        response = self.client.get(f'/api/chat/rooms/{room.slug}/messages/')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.json()['messages']), 1)

    def test_room_messages_invalid_limit_returns_400(self):
        """Проверяет сценарий `test_room_messages_invalid_limit_returns_400`."""
        response = self.client.get('/api/chat/rooms/public/messages/?limit=bad')
        self.assertEqual(response.status_code, 400)

    def test_room_messages_invalid_before_returns_400(self):
        """Проверяет сценарий `test_room_messages_invalid_before_returns_400`."""
        response = self.client.get('/api/chat/rooms/public/messages/?before=0')
        self.assertEqual(response.status_code, 400)

    def test_room_messages_invalid_slug_returns_400(self):
        """Проверяет сценарий `test_room_messages_invalid_slug_returns_400`."""
        response = self.client.get('/api/chat/rooms/public%2Fbad/messages/')
        self.assertEqual(response.status_code, 400)


class DirectApiTests(TestCase):
    """Группирует тестовые сценарии класса `DirectApiTests`."""
    def setUp(self):
        """Проверяет сценарий `setUp`."""
        self.client = Client()
        self.owner = User.objects.create_user(username='owner', password='pass12345')
        self.peer = User.objects.create_user(username='peer', password='pass12345')
        self.other = User.objects.create_user(username='other', password='pass12345')

    def _post_start(self, username):
        """Проверяет сценарий `_post_start`."""
        return self.client.post(
            '/api/chat/direct/start/',
            data=json.dumps({'username': username}),
            content_type='application/json',
        )

    def test_start_requires_auth(self):
        """Проверяет сценарий `test_start_requires_auth`."""
        response = self._post_start('peer')
        self.assertEqual(response.status_code, 401)

    def test_start_rejects_self(self):
        """Проверяет сценарий `test_start_rejects_self`."""
        self.client.force_login(self.owner)
        response = self._post_start('owner')
        self.assertEqual(response.status_code, 400)

    def test_start_rejects_missing_user(self):
        """Проверяет сценарий `test_start_rejects_missing_user`."""
        self.client.force_login(self.owner)
        response = self._post_start('missing')
        self.assertEqual(response.status_code, 404)

    def test_start_supports_username_with_at(self):
        """Проверяет сценарий `test_start_supports_username_with_at`."""
        self.client.force_login(self.owner)
        response = self._post_start('@peer')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()['peer']['username'], 'peer')
        self.assertIn('lastSeen', response.json()['peer'])

    def test_repeated_start_returns_same_slug(self):
        """Проверяет сценарий `test_repeated_start_returns_same_slug`."""
        self.client.force_login(self.owner)
        first = self._post_start('peer')
        second = self._post_start('peer')

        self.assertEqual(first.status_code, 200)
        self.assertEqual(second.status_code, 200)
        self.assertEqual(first.json()['slug'], second.json()['slug'])

    def test_direct_chats_empty_until_first_message(self):
        """Проверяет сценарий `test_direct_chats_empty_until_first_message`."""
        self.client.force_login(self.owner)
        start_response = self._post_start('peer')
        self.assertEqual(start_response.status_code, 200)

        response = self.client.get('/api/chat/direct/chats/')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()['items'], [])

    def test_direct_chats_include_dialog_after_message(self):
        """Проверяет сценарий `test_direct_chats_include_dialog_after_message`."""
        self.client.force_login(self.owner)
        start_response = self._post_start('peer')
        slug = start_response.json()['slug']

        Message.objects.create(
            username=self.owner.username,
            user=self.owner,
            room=slug,
            message_content='hello peer',
        )

        response = self.client.get('/api/chat/direct/chats/')
        self.assertEqual(response.status_code, 200)
        items = response.json()['items']
        self.assertEqual(len(items), 1)
        self.assertEqual(items[0]['peer']['username'], self.peer.username)
        self.assertIn('lastSeen', items[0]['peer'])
        self.assertEqual(items[0]['slug'], slug)


class ChatApiExtraCoverageTests(TestCase):
    """Группирует тестовые сценарии класса `ChatApiExtraCoverageTests`."""
    def setUp(self):
        """Проверяет сценарий `setUp`."""
        self.client = Client()
        self.factory = RequestFactory()
        self.owner = User.objects.create_user(username='owner_extra', password='pass12345')
        self.peer = User.objects.create_user(username='peer_extra', password='pass12345')

    def _post_direct_start(self, username):
        """Проверяет сценарий `_post_direct_start`."""
        return self.client.post(
            '/api/chat/direct/start/',
            data=json.dumps({'username': username}),
            content_type='application/json',
        )

    def test_parse_json_body_handles_form_and_invalid_payloads(self):
        """Проверяет сценарий `test_parse_json_body_handles_form_and_invalid_payloads`."""
        form_request = self.factory.post('/api/chat/direct/start/', {'username': 'alice'})
        payload = api._parse_json_body(form_request)
        self.assertEqual(payload['username'], 'alice')

        invalid_request = self.factory.generic(
            'POST',
            '/api/chat/direct/start/',
            data='{',
            content_type='application/json',
        )
        self.assertEqual(api._parse_json_body(invalid_request), {})

        list_request = self.factory.generic(
            'POST',
            '/api/chat/direct/start/',
            data='["value"]',
            content_type='application/json',
        )
        self.assertEqual(api._parse_json_body(list_request), {})

    def test_normalize_username_and_parse_pair_key_guards(self):
        """Проверяет сценарий `test_normalize_username_and_parse_pair_key_guards`."""
        self.assertEqual(api._normalize_username('@alice '), 'alice')
        self.assertEqual(api._normalize_username(123), '')
        self.assertIsNone(api._parse_pair_key_users('broken'))
        self.assertIsNone(api._parse_pair_key_users('1:bad'))

    def test_ensure_role_updates_snapshot_and_granted_by(self):
        """Проверяет сценарий `test_ensure_role_updates_snapshot_and_granted_by`."""
        room = Room.objects.create(slug='role-room-01', name='Role room', kind=Room.Kind.PRIVATE)
        role = ChatRole.objects.create(
            room=room,
            user=self.peer,
            role=ChatRole.Role.MEMBER,
            username_snapshot='stale_name',
            granted_by=None,
        )

        api._ensure_role(room, self.peer, ChatRole.Role.MEMBER, granted_by=self.owner)
        role.refresh_from_db()

        self.assertEqual(role.username_snapshot, self.peer.username)
        self.assertEqual(role.granted_by_id, self.owner.id)

    def test_ensure_room_owner_role_skips_room_without_creator(self):
        """Проверяет сценарий `test_ensure_room_owner_role_skips_room_without_creator`."""
        room = Room.objects.create(slug='owner-missing-01', name='Owner missing', kind=Room.Kind.PRIVATE)
        api._ensure_room_owner_role(room)
        self.assertFalse(ChatRole.objects.filter(room=room).exists())

    def test_public_room_repairs_legacy_public_record(self):
        """Проверяет сценарий `test_public_room_repairs_legacy_public_record`."""
        Room.objects.create(
            slug='public',
            name='Public Chat',
            kind=Room.Kind.PRIVATE,
            direct_pair_key='1:2',
        )

        room = api._public_room()
        self.assertEqual(room.kind, Room.Kind.PUBLIC)
        self.assertIsNone(room.direct_pair_key)

    def test_direct_start_returns_503_when_room_creation_fails(self):
        """Проверяет сценарий `test_direct_start_returns_503_when_room_creation_fails`."""
        self.client.force_login(self.owner)
        with patch('chat.api._ensure_direct_room_with_retry', side_effect=OperationalError):
            response = self._post_direct_start(self.peer.username)
        self.assertEqual(response.status_code, 503)

    def test_direct_start_returns_503_when_role_assignment_fails(self):
        """Проверяет сценарий `test_direct_start_returns_503_when_role_assignment_fails`."""
        self.client.force_login(self.owner)
        room = Room.objects.create(
            slug='dm_stub_01',
            name='stub',
            kind=Room.Kind.DIRECT,
            direct_pair_key=f'{self.owner.id}:{self.peer.id}',
            created_by=self.owner,
        )

        with patch('chat.api._ensure_direct_room_with_retry', return_value=(room, False)), patch(
            'chat.api._ensure_direct_roles',
            side_effect=OperationalError,
        ):
            response = self._post_direct_start(self.peer.username)

        self.assertEqual(response.status_code, 503)

    def test_room_details_returns_fallback_payload_when_db_unavailable(self):
        """Проверяет сценарий `test_room_details_returns_fallback_payload_when_db_unavailable`."""
        with patch('chat.api._resolve_room', side_effect=OperationalError):
            response = self.client.get('/api/chat/rooms/fallbackroom/')

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload['slug'], 'fallbackroom')
        self.assertEqual(payload['kind'], Room.Kind.PRIVATE)

    def test_room_messages_returns_404_for_missing_valid_room(self):
        """Проверяет сценарий `test_room_messages_returns_404_for_missing_valid_room`."""
        response = self.client.get('/api/chat/rooms/missingroom/messages/')
        self.assertEqual(response.status_code, 404)


class ChatAuthSmokeTests(TestCase):
    """Группирует тестовые сценарии класса `ChatAuthSmokeTests`."""
    def setUp(self):
        """Проверяет сценарий `setUp`."""
        self.client = Client(enforce_csrf_checks=True)

    def _csrf(self):
        """Проверяет сценарий `_csrf`."""
        response = self.client.get('/api/auth/csrf/')
        return response.cookies['csrftoken'].value

    def test_register_and_login(self):
        """Проверяет сценарий `test_register_and_login`."""
        csrf = self._csrf()
        register_payload = {
            'username': 'testuser',
            'password1': 'pass12345',
            'password2': 'pass12345',
        }
        response = self.client.post(
            '/api/auth/register/',
            data=json.dumps(register_payload),
            content_type='application/json',
            HTTP_X_CSRFTOKEN=csrf,
        )
        self.assertIn(response.status_code, [200, 201])

        csrf = self._csrf()
        login_payload = {'username': 'testuser', 'password': 'pass12345'}
        response = self.client.post(
            '/api/auth/login/',
            data=json.dumps(login_payload),
            content_type='application/json',
            HTTP_X_CSRFTOKEN=csrf,
        )
        self.assertEqual(response.status_code, 200)

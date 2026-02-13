import asyncio
import json
import time
from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock, patch

from asgiref.sync import async_to_sync
from django.contrib.auth import get_user_model
from django.contrib.auth.models import AnonymousUser
from django.core.cache import cache
from django.test import TestCase, override_settings

from chat.constants import CHAT_CLOSE_IDLE_CODE, PRESENCE_CLOSE_IDLE_CODE
from chat.consumers import ChatConsumer, DirectInboxConsumer, PresenceConsumer, _is_valid_room_slug
from chat.models import ChatRole, Room

User = get_user_model()


class ChatConsumerInternalTests(TestCase):
    def setUp(self):
        cache.clear()
        self.user = User.objects.create_user(username='chat_internal_user', password='pass12345')

    def _consumer(self, user=None):
        consumer = ChatConsumer()
        consumer.scope = {
            'user': user if user is not None else self.user,
            'headers': [(b'host', b'localhost:8000')],
            'scheme': 'ws',
            'client': ('127.0.0.1', 50001),
        }
        consumer.room_name = 'private123'
        consumer.room = Room(slug='private123', name='private', kind=Room.Kind.PRIVATE)
        consumer.room_group_name = 'chat_private123'
        consumer.channel_name = 'chat.channel'
        consumer.channel_layer = SimpleNamespace(
            group_discard=AsyncMock(),
            group_send=AsyncMock(),
        )
        consumer.send = AsyncMock()
        consumer.close = AsyncMock()
        consumer._can_write = AsyncMock(return_value=True)
        consumer._last_activity = 0.0
        return consumer

    @override_settings(CHAT_ROOM_SLUG_REGEX='[')
    def test_slug_validation_handles_invalid_regex(self):
        self.assertFalse(_is_valid_room_slug('private123'))

    def test_get_profile_image_name_returns_empty_when_profile_missing(self):
        consumer = self._consumer()
        user_without_profile = SimpleNamespace()

        result = async_to_sync(consumer._get_profile_image_name)(user_without_profile)
        self.assertEqual(result, '')

    @override_settings(CHAT_MESSAGE_RATE_LIMIT=2, CHAT_MESSAGE_RATE_WINDOW=60)
    def test_rate_limit_counts_and_resets(self):
        consumer = self._consumer()

        self.assertFalse(async_to_sync(consumer._rate_limited)(self.user))
        self.assertFalse(async_to_sync(consumer._rate_limited)(self.user))
        self.assertTrue(async_to_sync(consumer._rate_limited)(self.user))

        key = f'rl:chat:{self.user.id}'
        cache.set(key, {'count': 9, 'reset': time.time() - 1}, timeout=60)
        self.assertFalse(async_to_sync(consumer._rate_limited)(self.user))

    def test_chat_message_serializes_and_sends_payload(self):
        consumer = self._consumer()

        async_to_sync(consumer.chat_message)(
            {
                'message': 'hello',
                'username': 'chat_internal_user',
                'profile_pic': '/media/default.jpg',
                'room': 'private123',
            }
        )

        consumer.send.assert_awaited_once()
        payload = json.loads(consumer.send.await_args.kwargs['text_data'])
        self.assertEqual(payload['message'], 'hello')
        self.assertEqual(payload['room'], 'private123')

    def test_receive_ignores_message_for_anonymous_user(self):
        consumer = self._consumer(user=AnonymousUser())
        consumer.save_message = AsyncMock()
        consumer._rate_limited = AsyncMock(return_value=False)

        async_to_sync(consumer.receive)(json.dumps({'message': 'hello'}))

        consumer.save_message.assert_not_awaited()
        consumer.send.assert_not_awaited()

    def test_receive_returns_rate_limit_error(self):
        consumer = self._consumer()
        consumer.save_message = AsyncMock()
        consumer._rate_limited = AsyncMock(return_value=True)

        async_to_sync(consumer.receive)(json.dumps({'message': 'hello'}))

        consumer.save_message.assert_not_awaited()
        consumer.send.assert_awaited_once()
        payload = json.loads(consumer.send.await_args.kwargs['text_data'])
        self.assertEqual(payload['error'], 'rate_limited')

    def test_disconnect_without_group_name_is_safe(self):
        consumer = self._consumer()
        delattr(consumer, 'room_group_name')

        async_to_sync(consumer.disconnect)(1000)

    def test_disconnect_discards_group_when_present(self):
        consumer = self._consumer()
        class _IdleTask:
            def __init__(self):
                self.cancel = Mock()

            def __await__(self):
                async def _done():
                    return None

                return _done().__await__()

        idle_task = _IdleTask()
        consumer._idle_task = idle_task

        async_to_sync(consumer.disconnect)(1000)

        idle_task.cancel.assert_called_once()
        consumer.channel_layer.group_discard.assert_awaited_once_with(
            'chat_private123',
            'chat.channel',
        )

    def test_idle_watchdog_closes_connection_after_timeout(self):
        consumer = self._consumer()
        consumer.chat_idle_timeout = 1
        consumer._last_activity = 0.0

        async def _fast_sleep(_interval):
            return None

        with patch('chat.consumers.asyncio.sleep', new=_fast_sleep), patch(
            'chat.consumers.time.monotonic', return_value=10.0
        ):
            async_to_sync(consumer._idle_watchdog)()

        consumer.close.assert_awaited_once_with(code=CHAT_CLOSE_IDLE_CODE)


class PresenceConsumerInternalTests(TestCase):
    def setUp(self):
        cache.clear()
        self.user = User.objects.create_user(username='presence_internal_user', password='pass12345')

    def _consumer(self, user=None):
        consumer = PresenceConsumer()
        resolved_user = user if user is not None else self.user
        consumer.scope = {
            'user': resolved_user,
            'headers': [(b'host', b'localhost:8000')],
            'scheme': 'ws',
            'client': ('203.0.113.50', 56000),
        }
        consumer.channel_name = 'presence.channel'
        consumer.channel_layer = SimpleNamespace(
            group_add=AsyncMock(),
            group_discard=AsyncMock(),
            group_send=AsyncMock(),
        )
        consumer.group_name_auth = 'presence_auth_test'
        consumer.group_name_guest = 'presence_guest_test'
        consumer.cache_key = 'presence:auth:test'
        consumer.guest_cache_key = 'presence:guest:test'
        consumer.cache_timeout_seconds = 300
        consumer.presence_ttl = 90
        consumer.presence_grace = 5
        consumer.presence_touch_interval = 10
        consumer.presence_heartbeat = 1
        consumer.presence_idle_timeout = 1
        consumer.send = AsyncMock()
        consumer.close = AsyncMock()
        consumer._last_client_activity = 0.0
        consumer._next_presence_touch_at = 0.0
        consumer.guest_ip = '203.0.113.50'
        return consumer

    def test_decode_header_handles_utf8_and_latin1(self):
        consumer = self._consumer()
        self.assertEqual(consumer._decode_header('test'.encode('utf-8')), 'test')
        self.assertEqual(consumer._decode_header(b'\xff'), '\xff'.encode('latin-1').decode('latin-1'))

    def test_get_client_ip_uses_ip_utils(self):
        consumer = self._consumer(user=AnonymousUser())
        with patch('chat.consumers.get_client_ip_from_scope', return_value='198.51.100.7'):
            self.assertEqual(consumer._get_client_ip(), '198.51.100.7')

    def test_receive_ignores_invalid_payload_and_throttles_guest_ping(self):
        consumer = self._consumer(user=AnonymousUser())
        consumer.is_guest = True
        consumer._touch_guest = AsyncMock()

        async_to_sync(consumer.receive)(None)
        async_to_sync(consumer.receive)('not-json')
        async_to_sync(consumer.receive)(json.dumps({'type': 'pong'}))

        consumer._next_presence_touch_at = time.monotonic() + 100
        async_to_sync(consumer.receive)(json.dumps({'type': 'ping'}))
        consumer._touch_guest.assert_not_awaited()

        consumer._next_presence_touch_at = 0
        async_to_sync(consumer.receive)(json.dumps({'type': 'ping'}))
        consumer._touch_guest.assert_awaited_once_with('203.0.113.50')

    def test_receive_touches_authenticated_user(self):
        consumer = self._consumer()
        consumer.is_guest = False
        consumer._touch_user = AsyncMock()

        async_to_sync(consumer.receive)(json.dumps({'type': 'ping'}))

        consumer._touch_user.assert_awaited_once_with(self.user)

    def test_presence_update_sends_only_non_empty_payload(self):
        consumer = self._consumer()

        async_to_sync(consumer.presence_update)({})
        consumer.send.assert_not_awaited()

        async_to_sync(consumer.presence_update)({'guests': 3})
        consumer.send.assert_awaited_once()

    def test_heartbeat_stops_when_send_raises(self):
        consumer = self._consumer()
        consumer.send = AsyncMock(side_effect=RuntimeError('boom'))

        async def _fast_sleep(_interval):
            return None

        with patch('chat.consumers.asyncio.sleep', new=_fast_sleep):
            async_to_sync(consumer._heartbeat)()

        consumer.send.assert_awaited_once()

    def test_idle_watchdog_closes_on_timeout(self):
        consumer = self._consumer()
        consumer._last_client_activity = 0.0

        async def _fast_sleep(_interval):
            return None

        with patch('chat.consumers.asyncio.sleep', new=_fast_sleep), patch(
            'chat.consumers.time.monotonic', return_value=10.0
        ):
            async_to_sync(consumer._idle_watchdog)()

        consumer.close.assert_awaited_once_with(code=PRESENCE_CLOSE_IDLE_CODE)

    def test_guest_cache_lifecycle(self):
        consumer = self._consumer(user=AnonymousUser())

        async_to_sync(consumer._add_guest)('203.0.113.10')
        self.assertEqual(async_to_sync(consumer._get_guest_count)(), 1)

        async_to_sync(consumer._remove_guest)('203.0.113.10', graceful=False)
        self.assertEqual(async_to_sync(consumer._get_guest_count)(), 1)

        async_to_sync(consumer._remove_guest)('203.0.113.10', graceful=True)
        self.assertEqual(async_to_sync(consumer._get_guest_count)(), 0)

    def test_add_guest_handles_invalid_existing_count(self):
        consumer = self._consumer(user=AnonymousUser())
        cache.set(consumer.guest_cache_key, {'203.0.113.15': 'bad'}, timeout=300)

        async_to_sync(consumer._add_guest)('203.0.113.15')

        state = cache.get(consumer.guest_cache_key)
        self.assertEqual(state['203.0.113.15']['count'], 1)

    def test_user_presence_lifecycle_and_get_online_cleanup(self):
        consumer = self._consumer()

        async_to_sync(consumer._add_user)(self.user)
        async_to_sync(consumer._add_user)(self.user)
        async_to_sync(consumer._remove_user)(self.user, graceful=False)

        online = async_to_sync(consumer._get_online)()
        self.assertEqual(len(online), 1)
        self.assertEqual(online[0]['username'], self.user.username)

        async_to_sync(consumer._remove_user)(self.user, graceful=False)
        self.assertEqual(async_to_sync(consumer._get_online)()[0]['username'], self.user.username)

        async_to_sync(consumer._remove_user)(self.user, graceful=True)
        self.assertEqual(async_to_sync(consumer._get_online)(), [])

    def test_get_online_and_guest_count_drop_expired_entries(self):
        consumer = self._consumer()
        now = time.time()
        cache.set(
            consumer.cache_key,
            {
                'active': {'count': 1, 'last_seen': now - 1, 'grace_until': 0},
                'expired': {'count': 1, 'last_seen': now - 999, 'grace_until': 0},
                'grace': {'count': 0, 'last_seen': now - 1, 'grace_until': now + 10},
                'broken': {'count': 'x', 'last_seen': now - 1, 'grace_until': 0},
            },
            timeout=300,
        )
        cache.set(
            consumer.guest_cache_key,
            {
                '203.0.113.1': {'count': 1, 'last_seen': now - 1, 'grace_until': 0},
                '203.0.113.2': {'count': 1, 'last_seen': now - 999, 'grace_until': 0},
            },
            timeout=300,
        )

        online = async_to_sync(consumer._get_online)()
        self.assertEqual({row['username'] for row in online}, {'active', 'grace'})
        self.assertEqual(async_to_sync(consumer._get_guest_count)(), 1)

    def test_touch_user_and_guest_paths(self):
        consumer = self._consumer()

        async_to_sync(consumer._touch_user)(self.user)
        state = cache.get(consumer.cache_key)
        self.assertEqual(state[self.user.username]['count'], 1)

        async_to_sync(consumer._touch_guest)(None)
        async_to_sync(consumer._touch_guest)('203.0.113.20')
        guest_state = cache.get(consumer.guest_cache_key)
        self.assertEqual(guest_state['203.0.113.20']['count'], 1)

    def test_disconnect_paths_for_guest_and_auth(self):
        guest_consumer = self._consumer(user=AnonymousUser())
        guest_consumer.is_guest = True
        guest_consumer.group_name = guest_consumer.group_name_guest
        guest_consumer._heartbeat_task = None
        guest_consumer._idle_task = None
        guest_consumer._remove_guest = AsyncMock()
        guest_consumer._broadcast = AsyncMock()

        async_to_sync(guest_consumer.disconnect)(1001)

        guest_consumer._remove_guest.assert_awaited_once_with('203.0.113.50', graceful=True)
        guest_consumer._broadcast.assert_awaited_once()
        guest_consumer.channel_layer.group_discard.assert_awaited_once()

        auth_consumer = self._consumer()
        auth_consumer.is_guest = False
        auth_consumer.group_name = auth_consumer.group_name_auth
        auth_consumer._heartbeat_task = None
        auth_consumer._idle_task = None
        auth_consumer._remove_user = AsyncMock()
        auth_consumer._broadcast = AsyncMock()

        async_to_sync(auth_consumer.disconnect)(4000)

        auth_consumer._remove_user.assert_awaited_once_with(self.user, graceful=False)

    def test_connect_adds_guest_and_authenticated_users(self):
        guest_consumer = self._consumer(user=AnonymousUser())
        guest_consumer.accept = AsyncMock()
        guest_consumer._add_guest = AsyncMock()
        guest_consumer._add_user = AsyncMock()
        guest_consumer._broadcast = AsyncMock()

        def _fake_task(coro):
            coro.close()
            return AsyncMock(cancel=Mock())

        with patch('chat.consumers.asyncio.create_task', side_effect=_fake_task):
            async_to_sync(guest_consumer.connect)()

        guest_consumer._add_guest.assert_awaited_once_with('203.0.113.50')
        guest_consumer._add_user.assert_not_awaited()

        auth_consumer = self._consumer()
        auth_consumer.accept = AsyncMock()
        auth_consumer._add_guest = AsyncMock()
        auth_consumer._add_user = AsyncMock()
        auth_consumer._broadcast = AsyncMock()

        with patch('chat.consumers.asyncio.create_task', side_effect=_fake_task):
            async_to_sync(auth_consumer.connect)()

        auth_consumer._add_guest.assert_not_awaited()
        auth_consumer._add_user.assert_awaited_once_with(self.user)


class ChatConsumerDirectInboxTargetsTests(TestCase):
    def setUp(self):
        cache.clear()
        self.owner = User.objects.create_user(username='target_owner', password='pass12345')
        self.member = User.objects.create_user(username='target_member', password='pass12345')

    def _consumer(self):
        consumer = ChatConsumer()
        consumer.scope = {
            'user': self.owner,
            'headers': [(b'host', b'localhost:8000')],
            'scheme': 'ws',
            'client': ('127.0.0.1', 50005),
        }
        return consumer

    def test_build_targets_returns_empty_for_missing_room(self):
        consumer = self._consumer()
        result = async_to_sync(consumer._build_direct_inbox_targets)(999999, self.owner.id, 'msg', '2026-01-01T00:00:00Z')
        self.assertEqual(result, [])

    def test_build_targets_handles_invalid_pair_key(self):
        room = Room.objects.create(
            slug='dm_badpair',
            name='badpair',
            kind=Room.Kind.DIRECT,
            direct_pair_key='bad:value',
            created_by=self.owner,
        )
        ChatRole.objects.create(
            room=room,
            user=self.owner,
            role=ChatRole.Role.OWNER,
            username_snapshot=self.owner.username,
            granted_by=self.owner,
        )

        consumer = self._consumer()
        result = async_to_sync(consumer._build_direct_inbox_targets)(room.id, self.owner.id, 'msg', '2026-01-01T00:00:00Z')
        self.assertEqual(len(result), 1)
        self.assertEqual(result[0]['payload']['item']['slug'], room.slug)

    def test_build_targets_fills_missing_pair_participant_from_pair_key(self):
        room = Room.objects.create(
            slug='dm_missingpair',
            name='missingpair',
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

        consumer = self._consumer()
        targets = async_to_sync(consumer._build_direct_inbox_targets)(room.id, self.owner.id, 'hello', '2026-01-01T00:00:00Z')

        groups = {item['group'] for item in targets}
        self.assertIn(f'direct_inbox_user_{self.owner.id}', groups)
        self.assertIn(f'direct_inbox_user_{self.member.id}', groups)


class DirectInboxConsumerInternalTests(TestCase):
    def setUp(self):
        cache.clear()
        self.user = User.objects.create_user(username='direct_inbox_internal', password='pass12345')

    def _consumer(self):
        consumer = DirectInboxConsumer()
        consumer.scope = {
            'user': self.user,
            'headers': [(b'host', b'localhost:8000')],
            'scheme': 'ws',
            'client': ('127.0.0.1', 50100),
        }
        consumer.user = self.user
        consumer.conn_id = 'conn_1'
        consumer.group_name = 'direct_inbox_user_1'
        consumer.channel_name = 'direct.channel'
        consumer.channel_layer = SimpleNamespace(
            group_add=AsyncMock(),
            group_discard=AsyncMock(),
        )
        consumer.send = AsyncMock()
        consumer.close = AsyncMock()
        consumer._last_client_activity = 0.0
        return consumer

    def test_receive_handles_ping_and_payload_guards(self):
        consumer = self._consumer()
        consumer._touch_active_room = AsyncMock()
        consumer._send_error = AsyncMock()

        async_to_sync(consumer.receive)(json.dumps({'type': 'ping'}))
        consumer._touch_active_room.assert_awaited_once()

        async_to_sync(consumer.receive)('not-json')
        async_to_sync(consumer.receive)(json.dumps({'type': 'set_active_room', 'roomSlug': 123}))
        consumer._send_error.assert_awaited_with('invalid_payload')

    def test_receive_set_active_room_branches(self):
        consumer = self._consumer()
        consumer._clear_active_room = AsyncMock()
        consumer._set_active_room = AsyncMock()
        consumer._send_error = AsyncMock()
        consumer._load_room = AsyncMock(return_value=Room(slug='private123', name='p', kind=Room.Kind.PRIVATE))
        consumer._can_read = AsyncMock(return_value=False)

        async_to_sync(consumer.receive)(json.dumps({'type': 'set_active_room', 'roomSlug': None}))
        consumer._clear_active_room.assert_awaited_once_with(conn_only=True)

        async_to_sync(consumer.receive)(json.dumps({'type': 'set_active_room', 'roomSlug': 'bad/slug'}))
        consumer._send_error.assert_awaited_with('forbidden')

        async_to_sync(consumer.receive)(json.dumps({'type': 'set_active_room', 'roomSlug': 'private123'}))
        consumer._send_error.assert_awaited_with('forbidden')

    def test_receive_mark_read_branches(self):
        consumer = self._consumer()
        consumer._send_error = AsyncMock()
        consumer._mark_read = AsyncMock(return_value={'dialogs': 0, 'slugs': []})
        consumer._load_room = AsyncMock(return_value=None)
        consumer._can_read = AsyncMock(return_value=False)

        async_to_sync(consumer.receive)(json.dumps({'type': 'mark_read', 'roomSlug': 123}))
        consumer._send_error.assert_awaited_with('invalid_payload')

        async_to_sync(consumer.receive)(json.dumps({'type': 'mark_read', 'roomSlug': 'bad/slug'}))
        consumer._send_error.assert_awaited_with('forbidden')

    def test_direct_event_and_disconnect_and_watchdogs(self):
        consumer = self._consumer()
        consumer._clear_active_room = AsyncMock()

        async_to_sync(consumer.direct_inbox_event)({'payload': 'bad'})
        consumer.send.assert_not_awaited()

        async_to_sync(consumer.disconnect)(1000)
        consumer._clear_active_room.assert_awaited_once_with(conn_only=True)
        consumer.channel_layer.group_discard.assert_awaited_once()

        heartbeat_consumer = self._consumer()
        heartbeat_consumer.send = AsyncMock(side_effect=RuntimeError('boom'))

        async def _fast_sleep(_interval):
            return None

        with patch('chat.consumers.asyncio.sleep', new=_fast_sleep):
            async_to_sync(heartbeat_consumer._heartbeat)()

        idle_consumer = self._consumer()
        idle_consumer.idle_timeout = 1
        idle_consumer._last_client_activity = 0.0

        with patch('chat.consumers.asyncio.sleep', new=_fast_sleep), patch(
            'chat.consumers.time.monotonic', return_value=10.0
        ):
            async_to_sync(idle_consumer._idle_watchdog)()

        idle_consumer.close.assert_awaited_once()

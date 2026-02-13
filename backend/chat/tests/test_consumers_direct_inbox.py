import json

from asgiref.sync import async_to_sync
from channels.routing import URLRouter
from channels.testing import WebsocketCommunicator
from django.contrib.auth import get_user_model
from django.contrib.auth.models import AnonymousUser
from django.core.cache import cache
from django.test import TransactionTestCase

from chat.direct_inbox import mark_unread
from chat.models import ChatRole, Room
from chat.routing import websocket_urlpatterns

User = get_user_model()
application = URLRouter(websocket_urlpatterns)


class DirectInboxConsumerTests(TransactionTestCase):
    def setUp(self):
        cache.clear()
        self.owner = User.objects.create_user(username='owner_di', password='pass12345')
        self.member = User.objects.create_user(username='member_di', password='pass12345')
        self.other = User.objects.create_user(username='other_di', password='pass12345')

        self.direct_room = Room.objects.create(
            slug='dm_direct_inbox',
            name='dm',
            kind=Room.Kind.DIRECT,
            direct_pair_key=f'{self.owner.id}:{self.member.id}',
            created_by=self.owner,
        )
        ChatRole.objects.create(
            room=self.direct_room,
            user=self.owner,
            role=ChatRole.Role.OWNER,
            username_snapshot=self.owner.username,
            granted_by=self.owner,
        )
        ChatRole.objects.create(
            room=self.direct_room,
            user=self.member,
            role=ChatRole.Role.MEMBER,
            username_snapshot=self.member.username,
            granted_by=self.owner,
        )

        self.unrelated_room = Room.objects.create(
            slug='dm_unrelated_inbox',
            name='dm2',
            kind=Room.Kind.DIRECT,
            direct_pair_key=f'{self.member.id}:{self.other.id}',
            created_by=self.member,
        )
        ChatRole.objects.create(
            room=self.unrelated_room,
            user=self.member,
            role=ChatRole.Role.OWNER,
            username_snapshot=self.member.username,
            granted_by=self.member,
        )
        ChatRole.objects.create(
            room=self.unrelated_room,
            user=self.other,
            role=ChatRole.Role.MEMBER,
            username_snapshot=self.other.username,
            granted_by=self.member,
        )

    async def _connect_inbox(self, user=None):
        communicator = WebsocketCommunicator(
            application,
            '/ws/direct/inbox/',
            headers=[(b'host', b'localhost')],
        )
        communicator.scope['user'] = user if user is not None else AnonymousUser()
        communicator.scope['client'] = ('127.0.0.1', 50010)
        connected, close_code = await communicator.connect()
        return communicator, connected, close_code

    async def _connect_chat(self, room_slug: str, user):
        communicator = WebsocketCommunicator(
            application,
            f'/ws/chat/{room_slug}/',
            headers=[(b'host', b'localhost')],
        )
        communicator.scope['user'] = user
        communicator.scope['client'] = ('127.0.0.1', 50011)
        connected, close_code = await communicator.connect()
        return communicator, connected, close_code

    def test_guest_connection_is_rejected(self):
        async def run():
            _communicator, connected, close_code = await self._connect_inbox()
            self.assertFalse(connected)
            self.assertEqual(close_code, 4401)

        async_to_sync(run)()

    def test_authenticated_user_receives_initial_unread_state(self):
        mark_unread(self.member.id, self.direct_room.slug, ttl_seconds=60)

        async def run():
            communicator, connected, _ = await self._connect_inbox(self.member)
            self.assertTrue(connected)

            payload = json.loads(await communicator.receive_from(timeout=2))
            self.assertEqual(payload.get('type'), 'direct_unread_state')
            self.assertEqual(payload['unread']['dialogs'], 1)
            self.assertIn(self.direct_room.slug, payload['unread']['slugs'])
            self.assertEqual(payload['unread']['counts'].get(self.direct_room.slug), 1)

            await communicator.disconnect()

        async_to_sync(run)()

    def test_mark_read_decreases_unread_dialogs(self):
        mark_unread(self.member.id, self.direct_room.slug, ttl_seconds=60)
        mark_unread(self.member.id, self.unrelated_room.slug, ttl_seconds=60)

        async def run():
            communicator, connected, _ = await self._connect_inbox(self.member)
            self.assertTrue(connected)
            await communicator.receive_from(timeout=2)

            await communicator.send_to(text_data=json.dumps({'type': 'mark_read', 'roomSlug': self.direct_room.slug}))
            payload = json.loads(await communicator.receive_from(timeout=2))

            self.assertEqual(payload.get('type'), 'direct_mark_read_ack')
            self.assertEqual(payload['roomSlug'], self.direct_room.slug)
            self.assertEqual(payload['unread']['dialogs'], 1)
            self.assertNotIn(self.direct_room.slug, payload['unread']['slugs'])
            self.assertNotIn(self.direct_room.slug, payload['unread']['counts'])

            await communicator.disconnect()

        async_to_sync(run)()

    def test_set_active_room_checks_acl(self):
        async def run():
            communicator, connected, _ = await self._connect_inbox(self.owner)
            self.assertTrue(connected)
            await communicator.receive_from(timeout=2)

            await communicator.send_to(
                text_data=json.dumps({'type': 'set_active_room', 'roomSlug': self.unrelated_room.slug})
            )
            payload = json.loads(await communicator.receive_from(timeout=2))
            self.assertEqual(payload.get('type'), 'error')
            self.assertEqual(payload.get('code'), 'forbidden')

            await communicator.disconnect()

        async_to_sync(run)()

    def test_active_room_does_not_become_unread_for_open_dialog(self):
        async def run():
            inbox, connected, _ = await self._connect_inbox(self.member)
            self.assertTrue(connected)
            await inbox.receive_from(timeout=2)

            await inbox.send_to(
                text_data=json.dumps({'type': 'set_active_room', 'roomSlug': self.direct_room.slug})
            )

            chat, chat_connected, _ = await self._connect_chat(self.direct_room.slug, self.owner)
            self.assertTrue(chat_connected)

            await chat.send_to(text_data=json.dumps({'message': 'hello member'}))
            await chat.receive_from(timeout=2)

            inbox_payload = json.loads(await inbox.receive_from(timeout=2))
            self.assertEqual(inbox_payload.get('type'), 'direct_inbox_item')
            self.assertEqual(inbox_payload['item']['slug'], self.direct_room.slug)
            self.assertEqual(inbox_payload['unread']['dialogs'], 0)
            self.assertFalse(inbox_payload['unread']['isUnread'])
            self.assertEqual(inbox_payload['unread']['counts'], {})

            await chat.disconnect()
            await inbox.disconnect()

        async_to_sync(run)()

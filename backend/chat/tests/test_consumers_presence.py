"""????? PresenceConsumer."""

import json
from types import SimpleNamespace

from asgiref.sync import async_to_sync
from channels.routing import URLRouter
from channels.testing import WebsocketCommunicator
from django.contrib.auth import get_user_model
from django.contrib.auth.models import AnonymousUser
from django.test import TransactionTestCase

from chat.routing import websocket_urlpatterns

User = get_user_model()
application = URLRouter(websocket_urlpatterns)


class PresenceConsumerTests(TransactionTestCase):
    """????????? ????????? presence websocket ??? ?????? ? ??????????????."""

    def setUp(self):
        self.user = User.objects.create_user(username='presence_user', password='pass12345')

    async def _connect(self, user=None, ip='198.51.100.10', port=55000, session_key: str | None = None):
        communicator = WebsocketCommunicator(
            application,
            '/ws/presence/',
            headers=[(b'host', b'localhost')],
        )
        communicator.scope['user'] = user if user is not None else AnonymousUser()
        communicator.scope['client'] = (ip, port)
        communicator.scope['session'] = SimpleNamespace(session_key=session_key or f'session-{port}')
        connected, close_code = await communicator.connect()
        return communicator, connected, close_code

    def test_guest_connect_receives_count(self):
        async def run():
            communicator, connected, _ = await self._connect()
            self.assertTrue(connected)
            payload = json.loads(await communicator.receive_from(timeout=2))
            self.assertIn('guests', payload)
            self.assertGreaterEqual(payload['guests'], 1)
            await communicator.disconnect()

        async_to_sync(run)()

    def test_authenticated_receives_online_list(self):
        async def run():
            communicator, connected, _ = await self._connect(user=self.user)
            self.assertTrue(connected)
            payload = json.loads(await communicator.receive_from(timeout=2))
            self.assertIn('online', payload)
            usernames = [entry['username'] for entry in payload['online']]
            self.assertIn(self.user.username, usernames)
            await communicator.disconnect()

        async_to_sync(run)()

    def test_guests_count_unique_by_session(self):
        async def run():
            first, connected1, _ = await self._connect(ip='203.0.113.5', port=50001, session_key='guest-shared')
            self.assertTrue(connected1)
            await first.receive_from(timeout=2)

            second, connected2, _ = await self._connect(ip='203.0.113.5', port=50002, session_key='guest-shared')
            self.assertTrue(connected2)
            payload_second = json.loads(await second.receive_from(timeout=2))
            self.assertEqual(payload_second.get('guests'), 1)

            await second.disconnect()
            await first.disconnect()

        async_to_sync(run)()

    def test_guests_with_same_ip_and_different_sessions_are_counted_separately(self):
        async def run():
            first, connected1, _ = await self._connect(ip='203.0.113.8', port=50011, session_key='guest-a')
            self.assertTrue(connected1)
            await first.receive_from(timeout=2)

            second, connected2, _ = await self._connect(ip='203.0.113.8', port=50012, session_key='guest-b')
            self.assertTrue(connected2)
            payload_second = json.loads(await second.receive_from(timeout=2))
            self.assertEqual(payload_second.get('guests'), 2)

            await second.disconnect()
            await first.disconnect()

        async_to_sync(run)()

    def test_guest_without_session_is_rejected(self):
        async def run():
            communicator = WebsocketCommunicator(
                application,
                '/ws/presence/',
                headers=[(b'host', b'localhost')],
            )
            communicator.scope['user'] = AnonymousUser()
            communicator.scope['client'] = ('203.0.113.11', 55010)
            communicator.scope['session'] = SimpleNamespace(session_key=None)
            connected, close_code = await communicator.connect()
            self.assertFalse(connected)
            self.assertEqual(close_code, 4401)

        async_to_sync(run)()

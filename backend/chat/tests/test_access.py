from django.contrib.auth import get_user_model
from django.contrib.auth.models import AnonymousUser
from django.http import Http404
from django.test import TestCase

from chat.access import can_read, can_write, ensure_can_read_or_404, ensure_can_write, get_user_role
from chat.models import ChatRole, Room

User = get_user_model()


class ChatAccessTests(TestCase):
    def setUp(self):
        self.owner = User.objects.create_user(username='owner', password='pass12345')
        self.member = User.objects.create_user(username='member', password='pass12345')
        self.other = User.objects.create_user(username='other', password='pass12345')

        self.private_room = Room.objects.create(
            slug='private123',
            name='private',
            kind=Room.Kind.PRIVATE,
            created_by=self.owner,
        )
        ChatRole.objects.create(
            room=self.private_room,
            user=self.owner,
            role=ChatRole.Role.OWNER,
            username_snapshot=self.owner.username,
            granted_by=self.owner,
        )
        ChatRole.objects.create(
            room=self.private_room,
            user=self.member,
            role=ChatRole.Role.MEMBER,
            username_snapshot=self.member.username,
            granted_by=self.owner,
        )

    def test_public_room_permissions(self):
        public_room = Room.objects.create(slug='public', name='public', kind=Room.Kind.PUBLIC)

        self.assertTrue(can_read(public_room, AnonymousUser()))
        self.assertFalse(can_write(public_room, AnonymousUser()))
        self.assertTrue(can_write(public_room, self.owner))

    def test_get_user_role_returns_none_for_guest(self):
        self.assertIsNone(get_user_role(self.private_room, AnonymousUser()))

    def test_private_room_permissions(self):
        self.assertFalse(can_read(self.private_room, AnonymousUser()))
        self.assertFalse(can_write(self.private_room, AnonymousUser()))
        self.assertTrue(can_read(self.private_room, self.member))
        self.assertTrue(can_write(self.private_room, self.member))


    def test_direct_room_without_pair_key_denied(self):
        direct = Room.objects.create(
            slug='dm_empty',
            name='dm',
            kind=Room.Kind.DIRECT,
            direct_pair_key=None,
            created_by=self.owner,
        )
        ChatRole.objects.create(
            room=direct,
            user=self.owner,
            role=ChatRole.Role.OWNER,
            username_snapshot=self.owner.username,
            granted_by=self.owner,
        )

        self.assertFalse(can_read(direct, self.owner))
        self.assertFalse(can_write(direct, self.owner))

    def test_direct_room_pair_key_is_strict(self):
        direct = Room.objects.create(
            slug='dm_abc123',
            name='dm',
            kind=Room.Kind.DIRECT,
            direct_pair_key='not-valid',
            created_by=self.owner,
        )
        ChatRole.objects.create(
            room=direct,
            user=self.owner,
            role=ChatRole.Role.OWNER,
            username_snapshot=self.owner.username,
            granted_by=self.owner,
        )

        self.assertFalse(can_read(direct, self.owner))
        self.assertFalse(can_write(direct, self.owner))

    def test_direct_room_denies_third_user_even_with_role(self):
        direct = Room.objects.create(
            slug='dm_abc124',
            name='dm',
            kind=Room.Kind.DIRECT,
            direct_pair_key=f'{self.owner.id}:{self.member.id}',
            created_by=self.owner,
        )
        ChatRole.objects.create(
            room=direct,
            user=self.other,
            role=ChatRole.Role.ADMIN,
            username_snapshot=self.other.username,
            granted_by=self.owner,
        )

        self.assertFalse(can_read(direct, self.other))
        self.assertFalse(can_write(direct, self.other))

    def test_ensure_helpers(self):
        with self.assertRaises(Http404):
            ensure_can_read_or_404(self.private_room, self.other)

        self.assertFalse(ensure_can_write(self.private_room, self.other))
        self.assertTrue(ensure_can_write(self.private_room, self.owner))

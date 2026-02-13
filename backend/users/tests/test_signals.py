from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.db import IntegrityError
from django.test import TestCase

from chat.models import ChatRole, Message, Room
from users.models import Profile
from users.signals import ensure_profile

User = get_user_model()


class UserSignalsTests(TestCase):
    def test_profile_created_for_new_user(self):
        user = User.objects.create_user(username='signal_user', password='pass12345')
        self.assertTrue(Profile.objects.filter(user=user).exists())

    def test_profile_not_duplicated_on_user_update(self):
        user = User.objects.create_user(username='signal_user2', password='pass12345')
        self.assertEqual(Profile.objects.filter(user=user).count(), 1)

        user.email = 'updated@example.com'
        user.save(update_fields=['email'])

        self.assertEqual(Profile.objects.filter(user=user).count(), 1)

    def test_profile_recreated_if_removed_then_user_saved(self):
        user = User.objects.create_user(username='signal_user3', password='pass12345')
        Profile.objects.filter(user=user).delete()
        self.assertFalse(Profile.objects.filter(user=user).exists())

        user.first_name = 'Updated'
        user.save(update_fields=['first_name'])

        self.assertTrue(Profile.objects.filter(user=user).exists())

    def test_signal_skips_raw_fixture_saves(self):
        user = User.objects.create_user(username='signal_raw', password='pass12345')

        with patch('users.signals.Profile.objects.get_or_create') as get_or_create:
            ensure_profile(User, user, raw=True)

        get_or_create.assert_not_called()

    def test_signal_handles_integrity_error_race(self):
        user = User.objects.create_user(username='signal_race', password='pass12345')

        with patch('users.signals.Profile.objects.get_or_create', side_effect=IntegrityError), patch(
            'users.signals.Profile.objects.filter'
        ) as filter_qs:
            ensure_profile(User, user, raw=False)

        filter_qs.assert_called_once_with(user=user)
        filter_qs.return_value.first.assert_called_once()

    def test_username_rename_updates_messages_and_role_snapshots(self):
        user = User.objects.create_user(username='old_name', password='pass12345')
        room = Room.objects.create(name='Private', slug='private123', kind=Room.Kind.PRIVATE, created_by=user)
        ChatRole.objects.create(
            room=room,
            user=user,
            role=ChatRole.Role.OWNER,
            username_snapshot='old_name',
            granted_by=user,
        )
        Message.objects.create(
            username='old_name',
            user=user,
            room='private123',
            message_content='hello',
        )

        user.username = 'new_name'
        user.save(update_fields=['username'])

        self.assertTrue(Message.objects.filter(user=user, username='new_name').exists())
        self.assertTrue(ChatRole.objects.filter(user=user, username_snapshot='new_name').exists())

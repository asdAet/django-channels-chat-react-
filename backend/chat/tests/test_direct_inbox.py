from django.core.cache import cache
from django.test import TestCase

from chat.direct_inbox import (
    active_key,
    clear_active_room,
    get_unread_slugs,
    get_unread_state,
    is_room_active,
    mark_read,
    mark_unread,
    set_active_room,
    touch_active_room,
    unread_key,
    user_group_name,
)


class DirectInboxCacheTests(TestCase):
    def setUp(self):
        cache.clear()
        self.user_id = 10

    def test_group_name_and_keys(self):
        self.assertEqual(user_group_name(self.user_id), 'direct_inbox_user_10')
        self.assertEqual(unread_key(self.user_id), 'direct:unread:10')
        self.assertEqual(active_key(self.user_id), 'direct:active:10')

    def test_get_unread_slugs_normalizes_non_string_and_duplicates(self):
        cache.set(unread_key(self.user_id), ['dm_a', None, 'dm_a', ' ', 'dm_b'], timeout=60)
        self.assertEqual(get_unread_slugs(self.user_id), ['dm_a', 'dm_b'])

    def test_mark_unread_ignores_blank_slug(self):
        state = mark_unread(self.user_id, ' ', ttl_seconds=60)
        self.assertEqual(state, {'dialogs': 0, 'slugs': [], 'counts': {}})

    def test_mark_unread_adds_dialog_once(self):
        mark_unread(self.user_id, 'dm_a', ttl_seconds=60)
        state = mark_unread(self.user_id, 'dm_a', ttl_seconds=60)
        self.assertEqual(state, {'dialogs': 1, 'slugs': ['dm_a'], 'counts': {'dm_a': 2}})

    def test_mark_read_handles_blank_slug(self):
        mark_unread(self.user_id, 'dm_a', ttl_seconds=60)
        state = mark_read(self.user_id, '', ttl_seconds=60)
        self.assertEqual(state, {'dialogs': 1, 'slugs': ['dm_a'], 'counts': {'dm_a': 1}})

    def test_mark_read_clears_cache_when_last_dialog_removed(self):
        mark_unread(self.user_id, 'dm_a', ttl_seconds=60)
        state = mark_read(self.user_id, 'dm_a', ttl_seconds=60)
        self.assertEqual(state, {'dialogs': 0, 'slugs': [], 'counts': {}})
        self.assertIsNone(cache.get(unread_key(self.user_id)))

    def test_mark_read_keeps_other_dialogs(self):
        mark_unread(self.user_id, 'dm_a', ttl_seconds=60)
        mark_unread(self.user_id, 'dm_b', ttl_seconds=60)
        state = mark_read(self.user_id, 'dm_a', ttl_seconds=60)
        self.assertEqual(state, {'dialogs': 1, 'slugs': ['dm_b'], 'counts': {'dm_b': 1}})

    def test_touch_active_room_checks_conn_id(self):
        touch_active_room(self.user_id, 'missing', ttl_seconds=60)

        set_active_room(self.user_id, 'dm_a', conn_id='conn_1', ttl_seconds=60)
        touch_active_room(self.user_id, 'wrong', ttl_seconds=60)
        self.assertTrue(is_room_active(self.user_id, 'dm_a'))

        touch_active_room(self.user_id, 'conn_1', ttl_seconds=60)
        self.assertTrue(is_room_active(self.user_id, 'dm_a'))

    def test_clear_active_room_respects_conn_id(self):
        set_active_room(self.user_id, 'dm_a', conn_id='conn_1', ttl_seconds=60)
        clear_active_room(self.user_id, conn_id='other_conn')
        self.assertTrue(is_room_active(self.user_id, 'dm_a'))

        clear_active_room(self.user_id, conn_id='conn_1')
        self.assertFalse(is_room_active(self.user_id, 'dm_a'))

    def test_clear_active_room_without_conn_id_deletes_key(self):
        set_active_room(self.user_id, 'dm_a', conn_id='conn_1', ttl_seconds=60)
        clear_active_room(self.user_id)
        self.assertFalse(is_room_active(self.user_id, 'dm_a'))

    def test_is_room_active_returns_false_for_non_dict_value(self):
        cache.set(active_key(self.user_id), 'bad', timeout=60)
        self.assertFalse(is_room_active(self.user_id, 'dm_a'))

    def test_get_unread_state_returns_dialog_count(self):
        mark_unread(self.user_id, 'dm_a', ttl_seconds=60)
        mark_unread(self.user_id, 'dm_b', ttl_seconds=60)
        self.assertEqual(
            get_unread_state(self.user_id),
            {'dialogs': 2, 'slugs': ['dm_a', 'dm_b'], 'counts': {'dm_a': 1, 'dm_b': 1}},
        )

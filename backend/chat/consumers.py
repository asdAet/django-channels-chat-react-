import asyncio
import json
import re
import time
import uuid

from asgiref.sync import sync_to_async
from channels.generic.websocket import AsyncWebsocketConsumer
from django.conf import settings
from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.core.exceptions import ObjectDoesNotExist
from django.db import IntegrityError, OperationalError, ProgrammingError

from chat_app_django.ip_utils import get_client_ip_from_scope

from .access import READ_ROLES, can_read, can_write
from .constants import (
    CHAT_CLOSE_IDLE_CODE,
    DIRECT_INBOX_CLOSE_IDLE_CODE,
    PRESENCE_CACHE_KEY_AUTH,
    PRESENCE_CACHE_KEY_GUEST,
    PRESENCE_CACHE_TTL_SECONDS,
    PRESENCE_CLOSE_IDLE_CODE,
    PRESENCE_GROUP_AUTH,
    PRESENCE_GROUP_GUEST,
    PUBLIC_ROOM_NAME,
    PUBLIC_ROOM_SLUG,
)
from .direct_inbox import (
    clear_active_room,
    get_unread_state,
    is_room_active,
    mark_read,
    mark_unread,
    set_active_room,
    touch_active_room,
    user_group_name,
)
from .models import ChatRole, Message, Room
from .utils import build_profile_url

User = get_user_model()


def _is_valid_room_slug(value: str) -> bool:
    pattern = getattr(settings, "CHAT_ROOM_SLUG_REGEX", r"^[A-Za-z0-9_-]{3,50}$")
    try:
        return bool(re.match(pattern, value or ""))
    except re.error:
        return False


class ChatConsumer(AsyncWebsocketConsumer):
    chat_idle_timeout = int(getattr(settings, "CHAT_WS_IDLE_TIMEOUT", 600))
    direct_inbox_unread_ttl = int(getattr(settings, "DIRECT_INBOX_UNREAD_TTL", 30 * 24 * 60 * 60))

    async def connect(self):
        user = self.scope["user"]
        room_slug = self.scope["url_route"]["kwargs"]["room_name"]

        if room_slug != PUBLIC_ROOM_SLUG and not _is_valid_room_slug(room_slug):
            await self.close(code=4404)
            return

        room = await self._load_room(room_slug)
        if not room:
            await self.close(code=4404)
            return

        if not await self._can_read(room, user):
            await self.close(code=4403)
            return

        self.room = room
        self.room_name = room.slug
        room_identifier = room.id if getattr(room, "id", None) else room.slug
        self.room_group_name = f"chat_room_{room_identifier}"

        await self.channel_layer.group_add(self.room_group_name, self.channel_name)
        await self.accept()

        self._last_activity = time.monotonic()
        self._idle_task = None
        if self.chat_idle_timeout > 0:
            self._idle_task = asyncio.create_task(self._idle_watchdog())

    async def disconnect(self, close_code):
        idle_task = getattr(self, "_idle_task", None)
        if idle_task:
            idle_task.cancel()
            try:
                await idle_task
            except asyncio.CancelledError:
                pass

        if hasattr(self, "room_group_name"):
            await self.channel_layer.group_discard(self.room_group_name, self.channel_name)

    async def receive(self, text_data):
        self._last_activity = time.monotonic()
        try:
            text_data_json = json.loads(text_data)
        except json.JSONDecodeError:
            return

        message = text_data_json.get("message", "")
        if not isinstance(message, str):
            return
        message = message.strip()
        if not message:
            return

        max_len = int(getattr(settings, "CHAT_MESSAGE_MAX_LENGTH", 1000))
        if len(message) > max_len:
            await self.send(text_data=json.dumps({"error": "message_too_long"}))
            return

        user = self.scope["user"]
        if not user.is_authenticated:
            return

        if not await self._can_write(self.room, user):
            await self.send(text_data=json.dumps({"error": "forbidden"}))
            return

        if await self._rate_limited(user):
            await self.send(text_data=json.dumps({"error": "rate_limited"}))
            return

        username = user.username
        room_slug = self.room.slug

        profile_name = await self._get_profile_image_name(user)
        profile_url = build_profile_url(self.scope, profile_name)

        saved_message = await self.save_message(message, user, username, profile_name, room_slug)
        created_at = saved_message.date_added.isoformat()

        await self.channel_layer.group_send(
            self.room_group_name,
            {
                "type": "chat_message",
                "message": message,
                "username": username,
                "profile_pic": profile_url,
                "room": room_slug,
            },
        )

        if self.room.kind == Room.Kind.DIRECT:
            targets = await self._build_direct_inbox_targets(
                room_id=self.room.id,
                sender_id=user.id,
                message=message,
                created_at=created_at,
            )
            for target in targets:
                await self.channel_layer.group_send(
                    target["group"],
                    {
                        "type": "direct_inbox_event",
                        "payload": target["payload"],
                    },
                )

    async def chat_message(self, event):
        self._last_activity = time.monotonic()
        await self.send(
            text_data=json.dumps(
                {
                    "message": event["message"],
                    "username": event["username"],
                    "profile_pic": event["profile_pic"],
                    "room": event["room"],
                }
            )
        )

    async def _idle_watchdog(self):
        interval = max(10, min(60, self.chat_idle_timeout))
        while True:
            await asyncio.sleep(interval)
            if (time.monotonic() - self._last_activity) <= self.chat_idle_timeout:
                continue
            await self.close(code=CHAT_CLOSE_IDLE_CODE)
            break

    @sync_to_async
    def _load_room(self, slug: str):
        try:
            if slug == PUBLIC_ROOM_SLUG:
                room, _ = Room.objects.get_or_create(
                    slug=PUBLIC_ROOM_SLUG,
                    defaults={"name": PUBLIC_ROOM_NAME, "kind": Room.Kind.PUBLIC},
                )
                changed_fields = []
                if room.kind != Room.Kind.PUBLIC:
                    room.kind = Room.Kind.PUBLIC
                    changed_fields.append("kind")
                if room.direct_pair_key:
                    room.direct_pair_key = None
                    changed_fields.append("direct_pair_key")
                if changed_fields:
                    room.save(update_fields=changed_fields)
                return room
            return Room.objects.filter(slug=slug).first()
        except (OperationalError, ProgrammingError, IntegrityError):
            return None

    @sync_to_async
    def _can_read(self, room: Room, user) -> bool:
        return can_read(room, user)

    @sync_to_async
    def _can_write(self, room: Room, user) -> bool:
        return can_write(room, user)

    @sync_to_async
    def save_message(self, message, user, username, profile_pic, room):
        return Message.objects.create(
            message_content=message,
            username=username,
            user=user,
            profile_pic=profile_pic,
            room=room,
        )

    @sync_to_async
    def _get_profile_image_name(self, user) -> str:
        try:
            profile = user.profile
            name = getattr(profile.image, "name", "")
            return name or ""
        except (AttributeError, ObjectDoesNotExist):
            return ""

    @sync_to_async
    def _rate_limited(self, user) -> bool:
        limit = int(getattr(settings, "CHAT_MESSAGE_RATE_LIMIT", 20))
        window = int(getattr(settings, "CHAT_MESSAGE_RATE_WINDOW", 10))
        key = f"rl:chat:{user.id}"
        now = time.time()
        data = cache.get(key)
        if not data or data.get("reset", 0) <= now:
            cache.set(key, {"count": 1, "reset": now + window}, timeout=window)
            return False
        if data.get("count", 0) >= limit:
            return True
        data["count"] = data.get("count", 0) + 1
        cache.set(key, data, timeout=max(1, int(data["reset"] - now)))
        return False

    @sync_to_async
    def _build_direct_inbox_targets(self, room_id: int, sender_id: int, message: str, created_at: str):
        room = Room.objects.filter(id=room_id, kind=Room.Kind.DIRECT).first()
        if not room:
            return []

        roles = list(
            ChatRole.objects.filter(room=room, role__in=list(READ_ROLES))
            .select_related("user", "user__profile")
            .order_by("id")
        )

        pair_user_ids: set[int] = set()
        if room.direct_pair_key and ":" in room.direct_pair_key:
            first, second = room.direct_pair_key.split(":", 1)
            try:
                pair_user_ids = {int(first), int(second)}
            except (TypeError, ValueError):
                pair_user_ids = set()

        participants = []
        seen_user_ids: set[int] = set()
        for role in roles:
            user = role.user
            if not user:
                continue
            if pair_user_ids and user.id not in pair_user_ids:
                continue
            if user.id in seen_user_ids:
                continue
            seen_user_ids.add(user.id)
            participants.append(user)

        if pair_user_ids and len(participants) < len(pair_user_ids):
            missing_ids = [user_id for user_id in pair_user_ids if user_id not in seen_user_ids]
            if missing_ids:
                for user in User.objects.filter(id__in=missing_ids).select_related("profile"):
                    participants.append(user)
                    seen_user_ids.add(user.id)

        if not participants:
            return []

        targets = []
        for participant in participants:
            peer = next((candidate for candidate in participants if candidate.id != participant.id), None)
            peer_image_name = ""
            if peer:
                peer_profile = getattr(peer, "profile", None)
                peer_image = getattr(peer_profile, "image", None) if peer_profile else None
                peer_image_name = getattr(peer_image, "name", "") or ""

            if participant.id == sender_id or is_room_active(participant.id, room.slug):
                unread_state = mark_read(participant.id, room.slug, self.direct_inbox_unread_ttl)
            else:
                unread_state = mark_unread(participant.id, room.slug, self.direct_inbox_unread_ttl)

            slugs = unread_state.get("slugs", [])
            raw_counts = unread_state.get("counts", {})
            counts = raw_counts if isinstance(raw_counts, dict) else {}
            if not counts and isinstance(slugs, list):
                counts = {slug: 1 for slug in slugs if isinstance(slug, str) and slug}
            unread_count = counts.get(room.slug, 0)
            payload = {
                "type": "direct_inbox_item",
                "item": {
                    "slug": room.slug,
                    "peer": {
                        "username": peer.username if peer else "",
                        "profileImage": build_profile_url(self.scope, peer_image_name) if peer_image_name else None,
                    },
                    "lastMessage": message,
                    "lastMessageAt": created_at,
                },
                "unread": {
                    "roomSlug": room.slug,
                    "isUnread": unread_count > 0,
                    "dialogs": unread_state.get("dialogs", len(slugs)),
                    "slugs": slugs,
                    "counts": counts,
                },
            }
            targets.append({"group": user_group_name(participant.id), "payload": payload})
        return targets


class DirectInboxConsumer(AsyncWebsocketConsumer):
    unread_ttl = int(getattr(settings, "DIRECT_INBOX_UNREAD_TTL", 30 * 24 * 60 * 60))
    active_ttl = int(getattr(settings, "DIRECT_INBOX_ACTIVE_TTL", 90))
    heartbeat_seconds = int(getattr(settings, "DIRECT_INBOX_HEARTBEAT", 20))
    idle_timeout = int(getattr(settings, "DIRECT_INBOX_IDLE_TIMEOUT", 90))

    async def connect(self):
        user = self.scope.get("user")
        if not user or not user.is_authenticated:
            await self.close(code=4401)
            return

        self.user = user
        self.conn_id = uuid.uuid4().hex
        self.group_name = user_group_name(user.id)

        await self.channel_layer.group_add(self.group_name, self.channel_name)
        await self.accept()

        self._last_client_activity = time.monotonic()
        self._heartbeat_task = asyncio.create_task(self._heartbeat())
        self._idle_task = None
        if self.idle_timeout > 0:
            self._idle_task = asyncio.create_task(self._idle_watchdog())

        await self._send_unread_state()

    async def disconnect(self, close_code):
        for task_name in ("_heartbeat_task", "_idle_task"):
            task = getattr(self, task_name, None)
            if not task:
                continue
            task.cancel()
            try:
                await task
            except asyncio.CancelledError:
                pass

        user = getattr(self, "user", None)
        if user and user.is_authenticated:
            await self._clear_active_room(conn_only=True)

        if hasattr(self, "group_name"):
            await self.channel_layer.group_discard(self.group_name, self.channel_name)

    async def receive(self, text_data=None, bytes_data=None):
        if not text_data:
            return

        self._last_client_activity = time.monotonic()
        try:
            payload = json.loads(text_data)
        except json.JSONDecodeError:
            return

        event_type = payload.get("type")
        if event_type == "ping":
            await self._touch_active_room()
            return

        if event_type == "set_active_room":
            raw_slug = payload.get("roomSlug")
            if raw_slug is None:
                await self._clear_active_room(conn_only=True)
                return
            if not isinstance(raw_slug, str):
                await self._send_error("invalid_payload")
                return

            room_slug = raw_slug.strip()
            if not _is_valid_room_slug(room_slug):
                await self._send_error("forbidden")
                return

            room = await self._load_room(room_slug)
            if not room or room.kind != Room.Kind.DIRECT or not await self._can_read(room):
                await self._send_error("forbidden")
                return

            await self._set_active_room(room_slug)
            return

        if event_type == "mark_read":
            raw_slug = payload.get("roomSlug")
            if not isinstance(raw_slug, str):
                await self._send_error("invalid_payload")
                return

            room_slug = raw_slug.strip()
            if not _is_valid_room_slug(room_slug):
                await self._send_error("forbidden")
                return

            room = await self._load_room(room_slug)
            if not room or room.kind != Room.Kind.DIRECT or not await self._can_read(room):
                await self._send_error("forbidden")
                return

            unread = await self._mark_read(room_slug)
            await self.send(
                text_data=json.dumps(
                    {
                        "type": "direct_mark_read_ack",
                        "roomSlug": room_slug,
                        "unread": unread,
                    }
                )
            )

    async def direct_inbox_event(self, event):
        payload = event.get("payload")
        if not isinstance(payload, dict):
            return
        await self.send(text_data=json.dumps(payload))

    async def _send_unread_state(self):
        unread = await self._get_unread_state()
        await self.send(
            text_data=json.dumps(
                {
                    "type": "direct_unread_state",
                    "unread": unread,
                }
            )
        )

    async def _send_error(self, code: str):
        await self.send(
            text_data=json.dumps(
                {
                    "type": "error",
                    "code": code,
                }
            )
        )

    async def _heartbeat(self):
        interval = max(5, self.heartbeat_seconds)
        while True:
            await asyncio.sleep(interval)
            try:
                await self.send(text_data=json.dumps({"type": "ping"}))
            except Exception:
                break

    async def _idle_watchdog(self):
        interval = max(5, min(self.heartbeat_seconds, self.idle_timeout))
        while True:
            await asyncio.sleep(interval)
            if (time.monotonic() - self._last_client_activity) <= self.idle_timeout:
                continue
            await self.close(code=DIRECT_INBOX_CLOSE_IDLE_CODE)
            break

    @sync_to_async
    def _load_room(self, room_slug: str):
        return Room.objects.filter(slug=room_slug).first()

    @sync_to_async
    def _can_read(self, room: Room) -> bool:
        return can_read(room, self.user)

    @sync_to_async
    def _get_unread_state(self):
        return get_unread_state(self.user.id)

    @sync_to_async
    def _mark_read(self, room_slug: str):
        return mark_read(self.user.id, room_slug, self.unread_ttl)

    @sync_to_async
    def _set_active_room(self, room_slug: str):
        set_active_room(self.user.id, room_slug, self.conn_id, self.active_ttl)

    @sync_to_async
    def _clear_active_room(self, conn_only: bool = False):
        clear_active_room(self.user.id, self.conn_id if conn_only else None)

    @sync_to_async
    def _touch_active_room(self):
        touch_active_room(self.user.id, self.conn_id, self.active_ttl)


class PresenceConsumer(AsyncWebsocketConsumer):
    group_name_auth = PRESENCE_GROUP_AUTH
    group_name_guest = PRESENCE_GROUP_GUEST
    cache_key = PRESENCE_CACHE_KEY_AUTH
    guest_cache_key = PRESENCE_CACHE_KEY_GUEST
    presence_ttl = int(getattr(settings, "PRESENCE_TTL", 90))
    presence_grace = int(getattr(settings, "PRESENCE_GRACE", 5))
    presence_heartbeat = int(getattr(settings, "PRESENCE_HEARTBEAT", 20))
    presence_idle_timeout = int(getattr(settings, "PRESENCE_IDLE_TIMEOUT", 90))
    cache_timeout_seconds = PRESENCE_CACHE_TTL_SECONDS
    presence_touch_interval = int(getattr(settings, "PRESENCE_TOUCH_INTERVAL", 30))

    async def connect(self):
        user = self.scope.get("user")
        self.is_guest = not user or not user.is_authenticated
        self.group_name = self.group_name_guest if self.is_guest else self.group_name_auth
        self.guest_ip = self._get_client_ip() if self.is_guest else None

        await self.channel_layer.group_add(self.group_name, self.channel_name)
        await self.accept()

        self._last_client_activity = time.monotonic()
        self._next_presence_touch_at = 0.0
        self._heartbeat_task = asyncio.create_task(self._heartbeat())
        self._idle_task = None
        if self.presence_idle_timeout > 0:
            self._idle_task = asyncio.create_task(self._idle_watchdog())

        if self.is_guest:
            await self._add_guest(self.guest_ip)
        else:
            await self._add_user(user)
        await self._broadcast()

    async def disconnect(self, close_code):
        for task_name in ("_heartbeat_task", "_idle_task"):
            task = getattr(self, task_name, None)
            if not task:
                continue
            task.cancel()
            try:
                await task
            except asyncio.CancelledError:
                pass

        user = self.scope.get("user")
        graceful = close_code in (1000, 1001)
        if self.is_guest:
            await self._remove_guest(self.guest_ip, graceful=graceful)
        elif user and user.is_authenticated:
            await self._remove_user(user, graceful=graceful)

        await self._broadcast()
        await self.channel_layer.group_discard(self.group_name, self.channel_name)

    async def receive(self, text_data=None, bytes_data=None):
        if not text_data:
            return
        now = time.monotonic()
        self._last_client_activity = now
        try:
            payload = json.loads(text_data)
        except json.JSONDecodeError:
            return
        if payload.get("type") != "ping":
            return

        if now < self._next_presence_touch_at:
            return
        self._next_presence_touch_at = now + self.presence_touch_interval

        user = self.scope.get("user")
        if self.is_guest:
            await self._touch_guest(self.guest_ip)
        elif user and user.is_authenticated:
            await self._touch_user(user)

    async def _broadcast(self):
        online = await self._get_online()
        guests = await self._get_guest_count()
        await self.channel_layer.group_send(
            self.group_name_guest,
            {"type": "presence.update", "guests": guests},
        )
        await self.channel_layer.group_send(
            self.group_name_auth,
            {"type": "presence.update", "online": online, "guests": guests},
        )

    async def presence_update(self, event):
        payload = {}
        if "online" in event:
            payload["online"] = event["online"]
        if "guests" in event:
            payload["guests"] = event["guests"]
        if payload:
            await self.send(text_data=json.dumps(payload))

    async def _heartbeat(self):
        interval = max(5, self.presence_heartbeat)
        while True:
            await asyncio.sleep(interval)
            try:
                await self.send(text_data=json.dumps({"type": "ping"}))
            except Exception:
                break

    async def _idle_watchdog(self):
        interval = max(5, min(self.presence_heartbeat, self.presence_idle_timeout))
        while True:
            await asyncio.sleep(interval)
            if (time.monotonic() - self._last_client_activity) <= self.presence_idle_timeout:
                continue
            await self.close(code=PRESENCE_CLOSE_IDLE_CODE)
            break

    @sync_to_async
    def _add_user(self, user):
        data = cache.get(self.cache_key, {})
        current = data.get(user.username, {})
        count = current.get("count", 0) + 1
        image_name = getattr(getattr(user, "profile", None), "image", None)
        image_name = image_name.name if image_name else ""
        image_url = build_profile_url(self.scope, image_name) if image_name else None
        data[user.username] = {
            "count": count,
            "profileImage": image_url,
            "last_seen": time.time(),
            "grace_until": 0,
        }
        cache.set(self.cache_key, data, timeout=self.cache_timeout_seconds)

    @sync_to_async
    def _remove_user(self, user, graceful: bool = False):
        data = cache.get(self.cache_key, {})
        if user.username in data:
            entry = data[user.username]
            count = entry.get("count", 1) - 1
            now = time.time()
            if count <= 0:
                if graceful or self.presence_grace <= 0:
                    data.pop(user.username, None)
                else:
                    entry["count"] = 0
                    entry["last_seen"] = now
                    entry["grace_until"] = now + self.presence_grace
                    data[user.username] = entry
            else:
                entry["count"] = count
                entry["last_seen"] = now
                entry["grace_until"] = 0
                data[user.username] = entry
            cache.set(self.cache_key, data, timeout=self.cache_timeout_seconds)

    @sync_to_async
    def _get_online(self):
        data = cache.get(self.cache_key, {})
        now = time.time()
        cleaned = {}
        for username, info in data.items():
            try:
                count = int(info.get("count", 0))
            except (TypeError, ValueError):
                count = 0
            last_seen = info.get("last_seen", 0)
            grace_until = info.get("grace_until", 0)
            if count > 0 and (now - last_seen) <= self.presence_ttl:
                cleaned[username] = info
            elif (
                count <= 0
                and grace_until
                and grace_until > now
                and (now - last_seen) <= self.presence_ttl
            ):
                cleaned[username] = info
        if cleaned != data:
            cache.set(self.cache_key, cleaned, timeout=self.cache_timeout_seconds)
        return [
            {"username": username, "profileImage": info.get("profileImage")}
            for username, info in cleaned.items()
        ]

    @sync_to_async
    def _add_guest(self, ip: str | None):
        if not ip:
            return
        data = cache.get(self.guest_cache_key, {}) or {}
        current = data.get(ip, {})
        try:
            count = int(current.get("count", 0))
        except (TypeError, ValueError, AttributeError):
            count = 0
        data[ip] = {"count": count + 1, "last_seen": time.time(), "grace_until": 0}
        cache.set(self.guest_cache_key, data, timeout=self.cache_timeout_seconds)

    @sync_to_async
    def _remove_guest(self, ip: str | None, graceful: bool = False):
        if not ip:
            return
        data = cache.get(self.guest_cache_key, {}) or {}
        current = data.get(ip, {})
        try:
            count = int(current.get("count", 0))
        except (TypeError, ValueError, AttributeError):
            count = 0
        count -= 1
        now = time.time()
        if count <= 0:
            if graceful or self.presence_grace <= 0:
                data.pop(ip, None)
            else:
                data[ip] = {"count": 0, "last_seen": now, "grace_until": now + self.presence_grace}
        else:
            data[ip] = {"count": count, "last_seen": now, "grace_until": 0}
        if data:
            cache.set(self.guest_cache_key, data, timeout=self.cache_timeout_seconds)
        else:
            cache.delete(self.guest_cache_key)

    @sync_to_async
    def _get_guest_count(self) -> int:
        data = cache.get(self.guest_cache_key, {}) or {}
        now = time.time()
        cleaned = {}
        for ip, info in data.items():
            try:
                count = int(info.get("count", 0))
            except (TypeError, ValueError, AttributeError):
                count = 0
            last_seen = info.get("last_seen", 0)
            grace_until = info.get("grace_until", 0)
            if count > 0 and (now - last_seen) <= self.presence_ttl:
                cleaned[ip] = info
            elif (
                count <= 0
                and grace_until
                and grace_until > now
                and (now - last_seen) <= self.presence_ttl
            ):
                cleaned[ip] = info
        if cleaned != data:
            cache.set(self.guest_cache_key, cleaned, timeout=self.cache_timeout_seconds)
        return len(cleaned)

    @sync_to_async
    def _touch_user(self, user):
        data = cache.get(self.cache_key, {})
        current = data.get(user.username)
        image_name = getattr(getattr(user, "profile", None), "image", None)
        image_name = image_name.name if image_name else ""
        image_url = build_profile_url(self.scope, image_name) if image_name else None
        if not current:
            data[user.username] = {
                "count": 1,
                "profileImage": image_url,
                "last_seen": time.time(),
                "grace_until": 0,
            }
        else:
            current["last_seen"] = time.time()
            current["grace_until"] = 0
            if image_url:
                current["profileImage"] = image_url
            data[user.username] = current
        cache.set(self.cache_key, data, timeout=self.cache_timeout_seconds)

    @sync_to_async
    def _touch_guest(self, ip: str | None):
        if not ip:
            return
        data = cache.get(self.guest_cache_key, {}) or {}
        current = data.get(ip)
        if not current:
            data[ip] = {"count": 1, "last_seen": time.time(), "grace_until": 0}
        else:
            data[ip] = {
                "count": current.get("count", 1),
                "last_seen": time.time(),
                "grace_until": 0,
            }
        cache.set(self.guest_cache_key, data, timeout=self.cache_timeout_seconds)

    def _decode_header(self, value: bytes | None) -> str | None:
        if not value:
            return None
        try:
            return value.decode("utf-8")
        except UnicodeDecodeError:
            return value.decode("latin-1", errors="ignore")

    def _get_client_ip(self) -> str | None:
        return get_client_ip_from_scope(self.scope)

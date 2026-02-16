
"""Содержит логику модуля `api` подсистемы `chat`."""


import hashlib
import hmac
import json
import re
import time

from django.conf import settings
from django.contrib.auth import get_user_model
from django.db import IntegrityError, OperationalError, ProgrammingError, transaction
from django.http import Http404, JsonResponse
from django.views.decorators.http import require_http_methods

from .access import READ_ROLES, ensure_can_read_or_404
from .constants import PUBLIC_ROOM_NAME, PUBLIC_ROOM_SLUG
from .models import ChatRole, Message, Room
from .utils import build_profile_url_from_request

User = get_user_model()


def _build_profile_pic_url(request, profile_pic):
    """Выполняет логику `_build_profile_pic_url` с параметрами из сигнатуры."""
    if not profile_pic:
        return None

    try:
        raw_value = profile_pic.url
    except (AttributeError, ValueError):
        raw_value = str(profile_pic)

    return build_profile_url_from_request(request, raw_value)


def _serialize_peer(request, user):
    """Выполняет логику `_serialize_peer` с параметрами из сигнатуры."""
    profile_pic = None
    profile = getattr(user, "profile", None)
    image = getattr(profile, "image", None) if profile else None
    if image:
        profile_pic = _build_profile_pic_url(request, image)

    profile = getattr(user, "profile", None)
    last_seen = getattr(profile, "last_seen", None)
    return {
        "username": user.username,
        "profileImage": profile_pic,
        "lastSeen": last_seen.isoformat() if last_seen else None,
    }


def _parse_json_body(request):
    """Выполняет логику `_parse_json_body` с параметрами из сигнатуры."""
    if request.POST:
        return request.POST

    if not request.body:
        return {}

    try:
        payload = json.loads(request.body)
    except json.JSONDecodeError:
        return {}

    if isinstance(payload, dict):
        return payload
    return {}


def _normalize_username(raw_username):
    """Выполняет логику `_normalize_username` с параметрами из сигнатуры."""
    if not isinstance(raw_username, str):
        return ""
    value = raw_username.strip()
    if value.startswith("@"):
        value = value[1:]
    return value.strip()


def _direct_pair_key(user_a_id: int, user_b_id: int) -> str:
    """Выполняет логику `_direct_pair_key` с параметрами из сигнатуры."""
    low, high = sorted([int(user_a_id), int(user_b_id)])
    return f"{low}:{high}"


def _direct_room_slug(pair_key: str) -> str:
    """Выполняет логику `_direct_room_slug` с параметрами из сигнатуры."""
    salt = str(getattr(settings, "CHAT_DIRECT_SLUG_SALT", "") or settings.SECRET_KEY)
    digest = hmac.new(
        salt.encode("utf-8"),
        pair_key.encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()[:24]
    return f"dm_{digest}"


def _parse_pair_key_users(pair_key: str | None) -> tuple[int, int] | None:
    """Выполняет логику `_parse_pair_key_users` с параметрами из сигнатуры."""
    if not pair_key or ":" not in pair_key:
        return None
    first, second = pair_key.split(":", 1)
    try:
        return int(first), int(second)
    except (TypeError, ValueError):
        return None


def _ensure_role(room: Room, user, role: str, granted_by=None):
    """Выполняет логику `_ensure_role` с параметрами из сигнатуры."""
    role_obj, _ = ChatRole.objects.get_or_create(
        room=room,
        user=user,
        defaults={
            "role": role,
            "username_snapshot": user.username,
            "granted_by": granted_by,
        },
    )
    changed_fields = []
    if role_obj.username_snapshot != user.username:
        role_obj.username_snapshot = user.username
        changed_fields.append("username_snapshot")
    if granted_by and role_obj.granted_by_id != getattr(granted_by, "id", None):
        role_obj.granted_by = granted_by
        changed_fields.append("granted_by")
    if changed_fields:
        role_obj.save(update_fields=changed_fields)
    return role_obj


def _ensure_room_owner_role(room: Room):
    """Выполняет логику `_ensure_room_owner_role` с параметрами из сигнатуры."""
    if not room.created_by:
        return
    _ensure_role(room, room.created_by, ChatRole.Role.OWNER, granted_by=room.created_by)


def _ensure_direct_roles(room: Room, initiator, peer, created: bool):
    """Выполняет логику `_ensure_direct_roles` с параметрами из сигнатуры."""
    initiator_role = ChatRole.Role.OWNER if created else ChatRole.Role.MEMBER
    _ensure_role(room, initiator, initiator_role, granted_by=initiator)
    _ensure_role(room, peer, ChatRole.Role.MEMBER, granted_by=initiator)


def _create_or_get_direct_room(initiator, target, pair_key: str, slug: str):
    """Выполняет логику `_create_or_get_direct_room` с параметрами из сигнатуры."""
    room, created = Room.objects.get_or_create(
        direct_pair_key=pair_key,
        defaults={
            "slug": slug,
            "name": f"{initiator.username} - {target.username}",
            "kind": Room.Kind.DIRECT,
            "created_by": initiator,
        },
    )

    changed_fields = []
    if room.kind != Room.Kind.DIRECT:
        room.kind = Room.Kind.DIRECT
        changed_fields.append("kind")
    if not room.slug:
        room.slug = slug
        changed_fields.append("slug")
    if not room.name:
        room.name = f"{initiator.username} - {target.username}"
        changed_fields.append("name")
    if changed_fields:
        room.save(update_fields=changed_fields)

    return room, created


def _ensure_direct_room_with_retry(initiator, target, pair_key: str, slug: str):
    """Выполняет логику `_ensure_direct_room_with_retry` с параметрами из сигнатуры."""
    attempts = max(1, int(getattr(settings, "CHAT_DIRECT_START_RETRIES", 3)))

    for attempt in range(attempts):
        try:
            with transaction.atomic():
                return _create_or_get_direct_room(initiator, target, pair_key, slug)
        except IntegrityError:
            room = Room.objects.filter(direct_pair_key=pair_key).first()
            if room:
                return room, False
            if attempt == attempts - 1:
                raise
        except OperationalError as exc:
            # SQLite can transiently lock the DB (e.g. dev/e2e strict-mode double calls).
            room = Room.objects.filter(direct_pair_key=pair_key).first()
            if room:
                return room, False
            if "locked" not in str(exc).lower() or attempt == attempts - 1:
                raise
            time.sleep(0.05 * (attempt + 1))

    raise OperationalError("failed to create direct room")


def _direct_peer_for_user(room: Room, user):
    """Выполняет логику `_direct_peer_for_user` с параметрами из сигнатуры."""
    peer_role = (
        ChatRole.objects.filter(room=room)
        .exclude(user=user)
        .select_related("user", "user__profile")
        .order_by("id")
        .first()
    )
    if not peer_role:
        return None
    return peer_role.user


def _public_room():
    """Выполняет логику `_public_room` с параметрами из сигнатуры."""
    try:
        room, _created = Room.objects.get_or_create(
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
    except (OperationalError, ProgrammingError, IntegrityError):
        return Room(slug=PUBLIC_ROOM_SLUG, name=PUBLIC_ROOM_NAME, kind=Room.Kind.PUBLIC)


def _is_valid_room_slug(slug: str) -> bool:
    """Выполняет логику `_is_valid_room_slug` с параметрами из сигнатуры."""
    pattern = getattr(settings, "CHAT_ROOM_SLUG_REGEX", r"^[A-Za-z0-9_-]{3,50}$")
    try:
        return bool(re.match(pattern, slug or ""))
    except re.error:
        return False


def _parse_positive_int(raw_value: str | None, param_name: str) -> int:
    """Выполняет логику `_parse_positive_int` с параметрами из сигнатуры."""
    try:
        parsed = int(raw_value)  # type: ignore[arg-type]
    except (TypeError, ValueError):
        raise ValueError(f"Invalid '{param_name}': must be an integer")
    if parsed < 1:
        raise ValueError(f"Invalid '{param_name}': must be >= 1")
    return parsed


def _resolve_room(room_slug: str):
    """Выполняет логику `_resolve_room` с параметрами из сигнатуры."""
    if room_slug == PUBLIC_ROOM_SLUG:
        return _public_room(), None

    if not _is_valid_room_slug(room_slug):
        return None, JsonResponse({"error": "Invalid room slug"}, status=400)

    room = Room.objects.filter(slug=room_slug).first()
    return room, None


def _serialize_room_details(request, room: Room, created: bool):
    """Выполняет логику `_serialize_room_details` с параметрами из сигнатуры."""
    payload = {
        "slug": room.slug,
        "name": room.name,
        "kind": room.kind,
        "created": created,
        "createdBy": room.created_by.username if room.created_by else None,
        "peer": None,
    }

    if room.kind == Room.Kind.DIRECT and request.user.is_authenticated:
        peer = _direct_peer_for_user(room, request.user)
        if peer:
            payload["peer"] = _serialize_peer(request, peer)

    return payload


@require_http_methods(["GET"])
def public_room(request):
    """Выполняет логику `public_room` с параметрами из сигнатуры."""
    room = _public_room()
    return JsonResponse({"slug": room.slug, "name": room.name, "kind": room.kind})


@require_http_methods(["POST"])
def direct_start(request):
    """Выполняет логику `direct_start` с параметрами из сигнатуры."""
    if not request.user.is_authenticated:
        return JsonResponse({"error": "Authentication required"}, status=401)

    payload = _parse_json_body(request)
    target_username = _normalize_username(payload.get("username"))
    if not target_username:
        return JsonResponse({"error": "username is required"}, status=400)

    target = User.objects.filter(username=target_username).select_related("profile").first()
    if not target:
        return JsonResponse({"error": "Not found"}, status=404)

    if target.pk == request.user.pk:
        return JsonResponse({"error": "Cannot start direct chat with yourself"}, status=400)

    pair_key = _direct_pair_key(request.user.pk, target.pk)
    slug = _direct_room_slug(pair_key)

    try:
        room, created = _ensure_direct_room_with_retry(request.user, target, pair_key, slug)
    except OperationalError:
        return JsonResponse({"error": "Service unavailable"}, status=503)

    try:
        with transaction.atomic():
            _ensure_direct_roles(room, request.user, target, created=created)
    except OperationalError:
        return JsonResponse({"error": "Service unavailable"}, status=503)

    return JsonResponse(
        {
            "slug": room.slug,
            "kind": room.kind,
            "peer": _serialize_peer(request, target),
        }
    )


@require_http_methods(["GET"])
def direct_chats(request):
    """Выполняет логику `direct_chats` с параметрами из сигнатуры."""
    if not request.user.is_authenticated:
        return JsonResponse({"error": "Authentication required"}, status=401)

    role_qs = (
        ChatRole.objects.filter(
            user=request.user,
            room__kind=Room.Kind.DIRECT,
            role__in=list(READ_ROLES),
        )
        .select_related("room")
        .order_by("-updated_at")
    )

    seen_room_ids: set[int] = set()
    items = []
    for role in role_qs:
        room = role.room
        if room.id in seen_room_ids:
            continue
        seen_room_ids.add(room.id)

        pair = _parse_pair_key_users(room.direct_pair_key)
        if not pair or request.user.id not in pair:
            continue

        last_message = (
            Message.objects.filter(room=room.slug)
            .order_by("-date_added", "-id")
            .first()
        )
        if not last_message:
            continue

        peer = _direct_peer_for_user(room, request.user)
        if not peer:
            continue

        items.append(
            {
                "slug": room.slug,
                "peer": _serialize_peer(request, peer),
                "lastMessage": last_message.message_content,
                "lastMessageAt": last_message.date_added.isoformat(),
                "sortKey": last_message.date_added.timestamp(),
            }
        )

    items.sort(key=lambda item: item["sortKey"], reverse=True)
    for item in items:
        item.pop("sortKey", None)

    return JsonResponse({"items": items})


@require_http_methods(["GET"])
def room_details(request, room_slug):
    """Выполняет логику `room_details` с параметрами из сигнатуры."""
    try:
        room, error_response = _resolve_room(room_slug)
        if error_response:
            return error_response

        created = False
        if room is None:
            if not request.user.is_authenticated:
                return JsonResponse({"error": "Not found"}, status=404)

            room = Room.objects.create(
                slug=room_slug,
                name=request.user.username,
                kind=Room.Kind.PRIVATE,
                created_by=request.user,
            )
            _ensure_role(room, request.user, ChatRole.Role.OWNER, granted_by=request.user)
            created = True
        else:
            if room.kind in {Room.Kind.PRIVATE, Room.Kind.DIRECT}:
                try:
                    ensure_can_read_or_404(room, request.user)
                except Http404:
                    # Ensure owner role exists for legacy private rooms before rejecting.
                    _ensure_room_owner_role(room)
                    try:
                        ensure_can_read_or_404(room, request.user)
                    except Http404:
                        return JsonResponse({"error": "Not found"}, status=404)

        return JsonResponse(_serialize_room_details(request, room, created=created))
    except (OperationalError, ProgrammingError, IntegrityError):
        return JsonResponse(
            {
                "slug": room_slug,
                "name": room_slug,
                "kind": Room.Kind.PRIVATE,
                "created": True,
                "createdBy": None,
                "peer": None,
            }
        )


@require_http_methods(["GET"])
def room_messages(request, room_slug):
    """Выполняет логику `room_messages` с параметрами из сигнатуры."""
    room, error_response = _resolve_room(room_slug)
    if error_response:
        return error_response

    if room is None:
        return JsonResponse({"error": "Not found"}, status=404)

    if room.kind in {Room.Kind.PRIVATE, Room.Kind.DIRECT}:
        try:
            ensure_can_read_or_404(room, request.user)
        except Http404:
            return JsonResponse({"error": "Not found"}, status=404)

    try:
        default_page_size = max(1, int(getattr(settings, "CHAT_MESSAGES_PAGE_SIZE", 50)))
        max_page_size = max(
            default_page_size,
            int(getattr(settings, "CHAT_MESSAGES_MAX_PAGE_SIZE", 200)),
        )

        limit_raw = request.GET.get("limit")
        before_raw = request.GET.get("before")

        if limit_raw is None:
            limit = default_page_size
        else:
            try:
                limit = _parse_positive_int(limit_raw, "limit")
            except ValueError as exc:
                return JsonResponse({"error": str(exc)}, status=400)
        limit = min(limit, max_page_size)

        before_id = None
        if before_raw is not None:
            try:
                before_id = _parse_positive_int(before_raw, "before")
            except ValueError as exc:
                return JsonResponse({"error": str(exc)}, status=400)

        messages_qs = Message.objects.filter(room=room.slug).select_related("user", "user__profile")
        if before_id is not None:
            messages_qs = messages_qs.filter(id__lt=before_id)

        batch = list(messages_qs.order_by("-id")[: limit + 1])
        has_more = len(batch) > limit
        if has_more:
            batch = batch[:limit]
        batch.reverse()

        next_before = batch[0].id if has_more and batch else None

        serialized = []
        for message in batch:
            user = getattr(message, "user", None)
            username = user.username if user else message.username

            profile_source = None
            if user:
                profile = getattr(user, "profile", None)
                image = getattr(profile, "image", None) if profile else None
                if image:
                    profile_source = image
            if not profile_source:
                profile_source = message.profile_pic

            profile_pic = _build_profile_pic_url(request, profile_source)

            serialized.append(
                {
                    "id": message.id,
                    "username": username,
                    "content": message.message_content,
                    "profilePic": profile_pic,
                    "createdAt": message.date_added.isoformat(),
                }
            )

        return JsonResponse(
            {
                "messages": serialized,
                "pagination": {
                    "limit": limit,
                    "hasMore": has_more,
                    "nextBefore": next_before,
                },
            }
        )
    except (OperationalError, ProgrammingError):
        return JsonResponse(
            {
                "messages": [],
                "pagination": {
                    "limit": int(getattr(settings, "CHAT_MESSAGES_PAGE_SIZE", 50)),
                    "hasMore": False,
                    "nextBefore": None,
                },
            }
        )

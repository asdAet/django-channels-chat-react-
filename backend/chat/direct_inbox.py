from __future__ import annotations

from typing import Any

from django.core.cache import cache


UNREAD_KEY_PREFIX = "direct:unread"
ACTIVE_KEY_PREFIX = "direct:active"
USER_GROUP_PREFIX = "direct_inbox_user_"


def user_group_name(user_id: int) -> str:
    return f"{USER_GROUP_PREFIX}{int(user_id)}"


def unread_key(user_id: int) -> str:
    return f"{UNREAD_KEY_PREFIX}:{int(user_id)}"


def active_key(user_id: int) -> str:
    return f"{ACTIVE_KEY_PREFIX}:{int(user_id)}"


def _normalize_slugs(value: Any) -> list[str]:
    if not isinstance(value, list):
        return []
    seen: set[str] = set()
    result: list[str] = []
    for item in value:
        if not isinstance(item, str):
            continue
        slug = item.strip()
        if not slug or slug in seen:
            continue
        seen.add(slug)
        result.append(slug)
    return result


def _normalize_counts(value: Any) -> dict[str, int]:
    result: dict[str, int] = {}
    if isinstance(value, dict):
        for key, raw in value.items():
            slug = str(key).strip()
            if not slug:
                continue
            try:
                count = int(raw)
            except (TypeError, ValueError):
                continue
            if count <= 0:
                continue
            result[slug] = count
        return result
    if isinstance(value, list):
        for slug in _normalize_slugs(value):
            result[slug] = 1
    return result


def get_unread_slugs(user_id: int) -> list[str]:
    counts = _normalize_counts(cache.get(unread_key(user_id)))
    return list(counts.keys())


def get_unread_state(user_id: int) -> dict[str, Any]:
    counts = _normalize_counts(cache.get(unread_key(user_id)))
    slugs = list(counts.keys())
    return {
        "dialogs": len(slugs),
        "slugs": slugs,
        "counts": counts,
    }


def mark_unread(user_id: int, room_slug: str, ttl_seconds: int) -> dict[str, Any]:
    slug = str(room_slug or "").strip()
    if not slug:
        return get_unread_state(user_id)
    current = _normalize_counts(cache.get(unread_key(user_id)))
    current[slug] = current.get(slug, 0) + 1
    cache.set(unread_key(user_id), current, timeout=ttl_seconds)
    slugs = list(current.keys())
    return {
        "dialogs": len(slugs),
        "slugs": slugs,
        "counts": current,
    }


def mark_read(user_id: int, room_slug: str, ttl_seconds: int) -> dict[str, Any]:
    slug = str(room_slug or "").strip()
    if not slug:
        return get_unread_state(user_id)
    current = _normalize_counts(cache.get(unread_key(user_id)))
    current.pop(slug, None)
    if current:
        cache.set(unread_key(user_id), current, timeout=ttl_seconds)
    else:
        cache.delete(unread_key(user_id))
    slugs = list(current.keys())
    return {
        "dialogs": len(slugs),
        "slugs": slugs,
        "counts": current,
    }


def set_active_room(user_id: int, room_slug: str, conn_id: str, ttl_seconds: int) -> None:
    cache.set(
        active_key(user_id),
        {
            "roomSlug": room_slug,
            "connId": conn_id,
        },
        timeout=ttl_seconds,
    )


def touch_active_room(user_id: int, conn_id: str, ttl_seconds: int) -> None:
    value = cache.get(active_key(user_id))
    if not isinstance(value, dict):
        return
    if value.get("connId") != conn_id:
        return
    cache.set(active_key(user_id), value, timeout=ttl_seconds)


def clear_active_room(user_id: int, conn_id: str | None = None) -> None:
    if conn_id is None:
        cache.delete(active_key(user_id))
        return
    value = cache.get(active_key(user_id))
    if not isinstance(value, dict):
        return
    if value.get("connId") != conn_id:
        return
    cache.delete(active_key(user_id))


def is_room_active(user_id: int, room_slug: str) -> bool:
    value = cache.get(active_key(user_id))
    if not isinstance(value, dict):
        return False
    return value.get("roomSlug") == room_slug

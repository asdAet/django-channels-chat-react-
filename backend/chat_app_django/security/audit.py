"""Централизованная отправка security-аудита в выделенный logger."""

from __future__ import annotations

import json
import logging
from collections.abc import Mapping

from chat_app_django.ip_utils import get_client_ip_from_request, get_client_ip_from_scope

LOGGER_NAME = "security.audit"

_SENSITIVE_KEYS = {
    "password",
    "password1",
    "password2",
    "token",
    "csrf",
    "cookie",
    "authorization",
    "sessionid",
    "sig",
    "signature",
}


def _sanitize_value(value):
    """Очищает значение от избыточной/чувствительной вложенной информации."""
    if isinstance(value, Mapping):
        return {
            str(key): ("***" if str(key).lower() in _SENSITIVE_KEYS else _sanitize_value(raw))
            for key, raw in value.items()
        }
    if isinstance(value, (list, tuple, set)):
        return [_sanitize_value(item) for item in value]
    if isinstance(value, (str, int, float, bool)) or value is None:
        return value
    return str(value)


def _emit(event: str, payload: dict) -> None:
    """Отправляет событие в аудит-лог в структурированном JSON-формате."""
    logger = logging.getLogger(LOGGER_NAME)
    safe_payload = _sanitize_value(payload)
    logger.info(
        json.dumps(
            {
                "event": event,
                **safe_payload,
            },
            ensure_ascii=False,
            sort_keys=True,
        )
    )


def audit_security_event(event: str, **fields) -> None:
    """Логирует произвольное security-событие."""
    _emit(event, fields)


def audit_http_event(event: str, request, **fields) -> None:
    """Логирует security-событие HTTP с контекстом пользователя/сети."""
    user = getattr(request, "user", None)
    _emit(
        event,
        {
            "protocol": "http",
            "method": getattr(request, "method", None),
            "path": getattr(request, "path", None),
            "ip": get_client_ip_from_request(request),
            "username": getattr(user, "username", None) if getattr(user, "is_authenticated", False) else None,
            "is_authenticated": bool(getattr(user, "is_authenticated", False)),
            **fields,
        },
    )


def audit_ws_event(event: str, scope, **fields) -> None:
    """Логирует security-событие WebSocket с контекстом пользователя/сети."""
    user = scope.get("user")
    path = scope.get("path")
    _emit(
        event,
        {
            "protocol": "ws",
            "path": path,
            "ip": get_client_ip_from_scope(scope),
            "username": getattr(user, "username", None) if getattr(user, "is_authenticated", False) else None,
            "is_authenticated": bool(getattr(user, "is_authenticated", False)),
            **fields,
        },
    )


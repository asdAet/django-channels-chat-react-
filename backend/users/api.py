"""API ?????????????: auth/session/profile/media endpoints."""

from __future__ import annotations

import json
import time
from datetime import timedelta
from urllib.parse import quote

from django.conf import settings
from django.contrib.auth import authenticate, login, logout, password_validation
from django.contrib.auth.models import User
from django.core.files.storage import default_storage
from django.db import OperationalError, ProgrammingError
from django.http import FileResponse, HttpResponse, JsonResponse
from django.http.request import RawPostDataException
from django.middleware.csrf import get_token
from django.utils import timezone
from django.views.decorators.csrf import ensure_csrf_cookie
from django.views.decorators.http import require_http_methods

from chat.utils import (
    build_profile_url_from_request,
    is_valid_media_signature,
    normalize_media_path,
)
from chat_app_django.ip_utils import get_client_ip_from_request
from chat_app_django.security.audit import audit_http_event
from chat_app_django.security.rate_limit import DbRateLimiter, RateLimitPolicy

from .forms import ProfileUpdateForm, UserRegisterForm, UserUpdateForm
from .models import Profile


def _serialize_user(request, user):
    """??????????? ???????????? ??? ??????? API."""
    profile = getattr(user, "profile", None)
    profile_image = None
    if profile and getattr(profile, "image", None):
        image_name = getattr(profile.image, "name", "")
        if image_name:
            profile_image = build_profile_url_from_request(request, image_name)

    return {
        "username": user.username,
        "email": user.email,
        "profileImage": profile_image,
        "bio": getattr(profile, "bio", "") or "",
        "lastSeen": profile.last_seen.isoformat() if getattr(profile, "last_seen", None) else None,
        "registeredAt": user.date_joined.isoformat() if getattr(user, "date_joined", None) else None,
    }


def _parse_body(request):
    """????????? ????????? JSON/form payload ?? ???????."""
    content_type = request.META.get("CONTENT_TYPE", "")
    if content_type.startswith("multipart/form-data") or content_type.startswith("application/x-www-form-urlencoded"):
        return request.POST if request.POST else {}

    try:
        if request.body:
            try:
                return json.loads(request.body)
            except json.JSONDecodeError:
                pass
    except RawPostDataException:
        if request.POST:
            return request.POST
        return {}

    if request.POST:
        return request.POST
    return {}


def _collect_errors(*errors):
    """?????????? ValidationError-??????? ? ?????? ??????."""
    combined = {}
    for error_dict in errors:
        for field, messages in error_dict.items():
            combined[field] = list(messages)
    return combined


def _get_client_ip(request) -> str:
    """?????????? IP ??????? ? ?????? trusted proxy."""
    return get_client_ip_from_request(request) or ""


def _rate_limited(request, action: str) -> bool:
    """????????? auth rate-limit ????? ????????????? DB-??????."""
    limit = int(getattr(settings, "AUTH_RATE_LIMIT", 10))
    window = int(getattr(settings, "AUTH_RATE_WINDOW", 60))
    ip = _get_client_ip(request) or "unknown"
    scope_key = f"rl:auth:{action}:{ip}"
    policy = RateLimitPolicy(limit=limit, window_seconds=window)
    return DbRateLimiter.is_limited(scope_key=scope_key, policy=policy)


@ensure_csrf_cookie
@require_http_methods(["GET"])
def csrf_token(request):
    """?????? CSRF token ? ????????? CSRF cookie."""
    return JsonResponse({"csrfToken": get_token(request)})


@ensure_csrf_cookie
@require_http_methods(["GET"])
def session_view(request):
    """?????????? ??????? ?????? ????????????."""
    if request.user.is_authenticated:
        return JsonResponse({"authenticated": True, "user": _serialize_user(request, request.user)})
    return JsonResponse({"authenticated": False, "user": None})


@ensure_csrf_cookie
@require_http_methods(["GET"])
def presence_session_view(request):
    """?????????????? ???????? ?????? ??? presence websocket."""
    if not request.session.session_key:
        request.session.create()
    request.session.modified = True
    audit_http_event("presence.session.bootstrap", request)
    return JsonResponse({"ok": True})


@require_http_methods(["POST"])
def login_view(request):
    """????????? ???? ????????????."""
    if _rate_limited(request, "login"):
        audit_http_event("auth.login.rate_limited", request)
        return JsonResponse({"error": "Too many attempts"}, status=429)

    payload = _parse_body(request)
    if payload is None or payload == {}:
        audit_http_event("auth.login.failed", request, reason="empty_body")
        return JsonResponse(
            {"error": "???????? ???? ???????", "errors": {"body": ["?????? ???? ???????"]}},
            status=400,
        )

    username = payload.get("username")
    password = payload.get("password")
    if not username or not password:
        audit_http_event("auth.login.failed", request, reason="missing_credentials")
        return JsonResponse(
            {
                "error": "????????? ????? ? ??????",
                "errors": {"credentials": ["??????? ????? ? ??????"]},
            },
            status=400,
        )

    user = authenticate(request, username=username, password=password)
    if user is None:
        audit_http_event(
            "auth.login.failed",
            request,
            reason="invalid_credentials",
            attempted_username=username,
        )
        return JsonResponse(
            {
                "error": "???????? ????? ??? ??????",
                "errors": {"credentials": ["???????? ????? ??? ??????"]},
            },
            status=400,
        )

    login(request, user)
    audit_http_event("auth.login.success", request, username=user.username)
    return JsonResponse({"authenticated": True, "user": _serialize_user(request, user)})


@require_http_methods(["POST"])
def logout_view(request):
    """????????? logout ???????? ????????????."""
    user = getattr(request, "user", None)
    if user and user.is_authenticated:
        try:
            profile = getattr(user, "profile", None)
            if profile:
                profile.last_seen = timezone.now() - timedelta(minutes=5)
                profile.save(update_fields=["last_seen"])
        except (OperationalError, ProgrammingError):
            pass

    logout(request)
    audit_http_event("auth.logout", request)
    return JsonResponse({"ok": True})


@require_http_methods(["GET", "POST"])
def register_view(request):
    """???????????? ????????????."""
    if request.method == "GET":
        return JsonResponse(
            {"detail": "??????????? POST c ?????? username, password1, password2"},
            status=200,
        )

    if _rate_limited(request, "register"):
        audit_http_event("auth.register.rate_limited", request)
        return JsonResponse({"error": "Too many attempts"}, status=429)

    payload = _parse_body(request)
    if not payload:
        audit_http_event("auth.register.failed", request, reason="empty_body")
        return JsonResponse(
            {"error": "???????? ???? ???????", "errors": {"body": ["?????? ???? ???????"]}},
            status=400,
        )

    username = payload.get("username")
    password1 = payload.get("password1")
    password2 = payload.get("password2")

    if not username:
        audit_http_event("auth.register.failed", request, reason="missing_username")
        return JsonResponse(
            {"error": "????????? ??? ????????????", "errors": {"username": ["??????? ??? ????????????"]}},
            status=400,
        )
    if User.objects.filter(username=username).exists():
        audit_http_event("auth.register.failed", request, reason="username_exists", attempted_username=username)
        return JsonResponse(
            {"error": "??? ???????????? ??? ??????", "errors": {"username": ["??? ??? ??? ????????????"]}},
            status=400,
        )
    if not password1 or not password2:
        audit_http_event("auth.register.failed", request, reason="missing_password")
        return JsonResponse(
            {"error": "????????? ??????", "errors": {"password": ["??????? ??????"]}},
            status=400,
        )
    if password1 != password2:
        audit_http_event("auth.register.failed", request, reason="password_mismatch", attempted_username=username)
        return JsonResponse(
            {"error": "?????? ?? ?????????", "errors": {"password": ["?????? ?? ?????????"]}},
            status=400,
        )

    form = UserRegisterForm({"username": username, "password1": password1, "password2": password2})
    if form.is_valid():
        form.save()
        user = authenticate(request, username=payload.get("username"), password=payload.get("password1"))
        if user:
            login(request, user)
            audit_http_event("auth.register.success", request, username=user.username)
            return JsonResponse({"authenticated": True, "user": _serialize_user(request, user)}, status=201)
        audit_http_event("auth.register.success", request, username=username, authenticated=False)
        return JsonResponse({"ok": True}, status=201)

    errors = _collect_errors(form.errors)
    password_fields = {"password1", "password2"}
    if errors and password_fields.intersection(errors.keys()):
        errors.pop("password1", None)
        errors.pop("password2", None)
        errors["password"] = ["?????? ??????? ??????"]
        audit_http_event("auth.register.failed", request, reason="weak_password", attempted_username=username)
        return JsonResponse({"error": "?????? ??????? ??????", "errors": errors}, status=400)

    summary = " ".join(["; ".join(v) for v in errors.values()]) if errors else "?????? ?????????"
    audit_http_event("auth.register.failed", request, reason="validation_error", attempted_username=username, errors=errors)
    return JsonResponse({"error": summary, "errors": errors}, status=400)


@require_http_methods(["GET"])
def password_rules(request):
    """?????????? ??????? ????????? ??????."""
    return JsonResponse({"rules": password_validation.password_validators_help_texts()})


@require_http_methods(["GET"])
def media_view(request, file_path: str):
    """?????? media-???? ?? ???????????? URL ????? X-Accel-Redirect."""
    normalized_path = normalize_media_path(file_path)
    if not normalized_path:
        return JsonResponse({"error": "Not found"}, status=404)

    exp_raw = request.GET.get("exp")
    signature = request.GET.get("sig")
    try:
        expires_at = int(exp_raw)  # type: ignore[arg-type]
    except (TypeError, ValueError):
        audit_http_event("media.signature.invalid", request, path=file_path, reason="invalid_exp")
        return JsonResponse({"error": "Forbidden"}, status=403)

    now = int(time.time())
    if expires_at < now:
        audit_http_event("media.signature.expired", request, path=normalized_path)
        return JsonResponse({"error": "Forbidden"}, status=403)

    if not is_valid_media_signature(normalized_path, expires_at, signature):
        audit_http_event("media.signature.invalid", request, path=normalized_path, reason="bad_signature")
        return JsonResponse({"error": "Forbidden"}, status=403)

    if not default_storage.exists(normalized_path):
        return JsonResponse({"error": "Not found"}, status=404)

    cache_seconds = max(0, expires_at - now)
    if settings.DEBUG:
        response = FileResponse(default_storage.open(normalized_path, "rb"))
    else:
        response = HttpResponse()
        response["X-Accel-Redirect"] = f"/_protected_media/{quote(normalized_path, safe='/')}"

    response["Cache-Control"] = f"private, max-age={cache_seconds}"
    return response


@require_http_methods(["GET"])
def public_profile_view(request, username: str):
    """?????????? ????????? ??????? ????????????."""
    if not username:
        return JsonResponse({"error": "Not found"}, status=404)

    user = User.objects.filter(username=username).select_related("profile").first()
    if not user:
        return JsonResponse({"error": "Not found"}, status=404)

    profile = getattr(user, "profile", None)
    profile_image = None
    if profile and getattr(profile, "image", None):
        image_name = getattr(profile.image, "name", "")
        if image_name:
            profile_image = build_profile_url_from_request(request, image_name)

    return JsonResponse(
        {
            "user": {
                "username": user.username,
                "email": "",
                "profileImage": profile_image,
                "bio": getattr(profile, "bio", "") or "",
                "lastSeen": profile.last_seen.isoformat() if getattr(profile, "last_seen", None) else None,
                "registeredAt": user.date_joined.isoformat() if getattr(user, "date_joined", None) else None,
            }
        }
    )


@require_http_methods(["GET", "POST"])
def profile_view(request):
    """??????/?????????? ??????? ???????? ????????????."""
    if not request.user.is_authenticated:
        return JsonResponse({"error": "????????? ???????????"}, status=401)

    if request.method == "GET":
        return JsonResponse({"user": _serialize_user(request, request.user)})

    payload = _parse_body(request)
    u_form = UserUpdateForm(payload, instance=request.user)
    p_form = ProfileUpdateForm(payload, request.FILES, instance=request.user.profile)

    if u_form.is_valid() and p_form.is_valid():
        u_form.save()
        p_form.save()
        audit_http_event("auth.profile.update.success", request, username=request.user.username)
        return JsonResponse({"user": _serialize_user(request, request.user)})

    errors = _collect_errors(u_form.errors, p_form.errors)
    audit_http_event("auth.profile.update.failed", request, username=request.user.username, errors=errors)
    return JsonResponse({"errors": errors}, status=400)

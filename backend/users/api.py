
"""Содержит логику модуля `api` подсистемы `users`."""


import json
import time
from datetime import timedelta
from urllib.parse import quote

from django.contrib.auth import authenticate, login, logout, password_validation
from django.contrib.auth.models import User
from django.http import FileResponse, HttpResponse, JsonResponse
from django.http.request import RawPostDataException
from django.core.cache import cache
from django.core.files.storage import default_storage
from django.conf import settings
from chat_app_django.ip_utils import get_client_ip_from_request
from chat.utils import (
    build_profile_url_from_request,
    is_valid_media_signature,
    normalize_media_path,
)
from django.middleware.csrf import get_token
from django.utils import timezone
from django.views.decorators.csrf import ensure_csrf_cookie
from django.views.decorators.http import require_http_methods
from django.db import OperationalError, ProgrammingError

from .forms import ProfileUpdateForm, UserRegisterForm, UserUpdateForm
from .models import Profile


def _serialize_user(request, user):
    """Выполняет логику `_serialize_user` с параметрами из сигнатуры."""
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
    """Выполняет логику `_parse_body` с параметрами из сигнатуры."""
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
    """Выполняет логику `_collect_errors` с параметрами из сигнатуры."""
    combined = {}
    for error_dict in errors:
        for field, messages in error_dict.items():
            combined[field] = list(messages)
    return combined


def _get_client_ip(request) -> str:
    """Выполняет логику `_get_client_ip` с параметрами из сигнатуры."""
    return get_client_ip_from_request(request) or ""


def _rate_limited(request, action: str) -> bool:
    """Выполняет логику `_rate_limited` с параметрами из сигнатуры."""
    limit = int(getattr(settings, "AUTH_RATE_LIMIT", 10))
    window = int(getattr(settings, "AUTH_RATE_WINDOW", 60))
    ip = _get_client_ip(request) or "unknown"
    key = f"rl:auth:{action}:{ip}"
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


@ensure_csrf_cookie
@require_http_methods(["GET"])
def csrf_token(request):
    """Выполняет логику `csrf_token` с параметрами из сигнатуры."""
    return JsonResponse({"csrfToken": get_token(request)})


@ensure_csrf_cookie
@require_http_methods(["GET"])
def session_view(request):
    """Выполняет логику `session_view` с параметрами из сигнатуры."""
    if request.user.is_authenticated:
        return JsonResponse(
            {"authenticated": True, "user": _serialize_user(request, request.user)}
        )
    return JsonResponse({"authenticated": False, "user": None})


@require_http_methods(["POST"])
def login_view(request):
    """Выполняет логику `login_view` с параметрами из сигнатуры."""
    if _rate_limited(request, "login"):
        return JsonResponse({"error": "Too many attempts"}, status=429)
    payload = _parse_body(request)
    if payload is None or payload == {}:
        return JsonResponse(
            {"error": "Неверное тело запроса", "errors": {"body": ["Пустое тело запроса"]}},
            status=400,
        )

    username = payload.get("username")
    password = payload.get("password")
    if not username or not password:
        return JsonResponse(
            {
                "error": "Требуются логин и пароль",
                "errors": {"credentials": ["Укажите логин и пароль"]},
            },
            status=400,
        )

    user = authenticate(request, username=username, password=password)
    if user is None:
        return JsonResponse(
            {
                "error": "Неверный логин или пароль",
                "errors": {"credentials": ["Неверный логин или пароль"]},
            },
            status=400,
        )

    login(request, user)
    return JsonResponse({"authenticated": True, "user": _serialize_user(request, user)})


@require_http_methods(["POST"])
def logout_view(request):
    """Выполняет логику `logout_view` с параметрами из сигнатуры."""
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
    return JsonResponse({"ok": True})


@require_http_methods(["GET", "POST"])
def register_view(request):
    """Выполняет логику `register_view` с параметрами из сигнатуры."""
    if request.method == "GET":
        return JsonResponse(
            {"detail": "Используйте POST c полями username, password1, password2"},
            status=200,
        )

    if _rate_limited(request, "register"):
        return JsonResponse({"error": "Too many attempts"}, status=429)

    payload = _parse_body(request)
    if not payload:
        return JsonResponse(
            {"error": "Неверное тело запроса", "errors": {"body": ["Пустое тело запроса"]}},
            status=400,
        )

    username = payload.get("username")
    password1 = payload.get("password1")
    password2 = payload.get("password2")

    if not username:
        return JsonResponse(
            {"error": "Требуется имя пользователя", "errors": {"username": ["Укажите имя пользователя"]}},
            status=400,
        )
    if User.objects.filter(username=username).exists():
        return JsonResponse(
            {"error": "Имя пользователя уже занято", "errors": {"username": ["Это имя уже используется"]}},
            status=400,
        )
    if not password1 or not password2:
        return JsonResponse(
            {"error": "Требуется пароль", "errors": {"password": ["Укажите пароль"]}},
            status=400,
        )
    if password1 != password2:
        return JsonResponse(
            {"error": "Пароли не совпадают", "errors": {"password": ["Пароли не совпадают"]}},
            status=400,
        )

    form = UserRegisterForm(
        {"username": username, "password1": password1, "password2": password2}
    )
    if form.is_valid():
        form.save()
        user = authenticate(
            request,
            username=payload.get("username"),
            password=payload.get("password1"),
        )
        if user:
            login(request, user)
            return JsonResponse(
                {"authenticated": True, "user": _serialize_user(request, user)}, status=201
            )
        return JsonResponse({"ok": True}, status=201)

    errors = _collect_errors(form.errors)
    password_fields = {"password1", "password2"}
    if errors and password_fields.intersection(errors.keys()):
        errors.pop("password1", None)
        errors.pop("password2", None)
        errors["password"] = ["Пароль слишком слабый"]
        return JsonResponse(
            {"error": "Пароль слишком слабый", "errors": errors}, status=400
        )
    
    summary = " ".join(["; ".join(v) for v in errors.values()]) if errors else "Ошибка валидации"
    return JsonResponse({"error": summary, "errors": errors}, status=400)


@require_http_methods(["GET"])
def password_rules(request):
    """Выполняет логику `password_rules` с параметрами из сигнатуры."""
    return JsonResponse({"rules": password_validation.password_validators_help_texts()})


@require_http_methods(["GET"])
def media_view(request, file_path: str):
    """Выдает media-файл по подписанному URL через X-Accel-Redirect."""
    normalized_path = normalize_media_path(file_path)
    if not normalized_path:
        return JsonResponse({"error": "Not found"}, status=404)

    exp_raw = request.GET.get("exp")
    signature = request.GET.get("sig")
    try:
        expires_at = int(exp_raw)  # type: ignore[arg-type]
    except (TypeError, ValueError):
        return JsonResponse({"error": "Forbidden"}, status=403)

    now = int(time.time())
    if expires_at < now:
        return JsonResponse({"error": "Forbidden"}, status=403)

    if not is_valid_media_signature(normalized_path, expires_at, signature):
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
    """Выполняет логику `public_profile_view` с параметрами из сигнатуры."""
    if not username:
        return JsonResponse({"error": "Not found"}, status=404)

    user = (
        User.objects.filter(username=username)
        .select_related("profile")
        .first()
    )
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
    """Выполняет логику `profile_view` с параметрами из сигнатуры."""
    if not request.user.is_authenticated:
        return JsonResponse({"error": "Требуется авторизация"}, status=401)

    if request.method == "GET":
        return JsonResponse({"user": _serialize_user(request, request.user)})

    payload = _parse_body(request)
    u_form = UserUpdateForm(payload, instance=request.user)
    p_form = ProfileUpdateForm(
        payload, request.FILES, instance=request.user.profile
    )

    if u_form.is_valid() and p_form.is_valid():
        u_form.save()
        p_form.save()
        return JsonResponse({"user": _serialize_user(request, request.user)})

    return JsonResponse({"errors": _collect_errors(u_form.errors, p_form.errors)}, status=400)



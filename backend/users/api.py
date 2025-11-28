import json

from django.contrib.auth import authenticate, login, logout
from django.contrib.auth.models import User
from django.http import JsonResponse
from django.middleware.csrf import get_token
from django.views.decorators.csrf import ensure_csrf_cookie, csrf_exempt
from django.views.decorators.http import require_http_methods

from .forms import ProfileUpdateForm, UserRegisterForm, UserUpdateForm


def _serialize_user(request, user):
    profile = getattr(user, "profile", None)
    profile_image = None
    if profile and getattr(profile, "image", None):
        try:
            profile_image = request.build_absolute_uri(profile.image.url)
        except ValueError:
            # In case media is misconfigured, avoid breaking the response.
            profile_image = None

    return {
        "username": user.username,
        "email": user.email,
        "firstName": user.first_name,
        "lastName": user.last_name,
        "profileImage": profile_image,
    }


def _parse_body(request):
    # Try JSON body first
    if request.body:
        try:
            return json.loads(request.body)
        except json.JSONDecodeError:
            pass
    # Fallback to form-encoded data (e.g., sent from Postman/HTML form)
    if request.POST:
        return request.POST
    return {}


def _collect_errors(*errors):
    combined = {}
    for error_dict in errors:
        for field, messages in error_dict.items():
            combined[field] = list(messages)
    return combined


@ensure_csrf_cookie
@require_http_methods(["GET"])
def csrf_token(request):
    """
    Exposes a CSRF cookie for the SPA without rendering templates.
    """
    return JsonResponse({"csrfToken": get_token(request)})


@ensure_csrf_cookie
@require_http_methods(["GET"])
def session_view(request):
    """
    Returns the authenticated user for bootstrapping the React app.
    """
    if request.user.is_authenticated:
        return JsonResponse(
            {"authenticated": True, "user": _serialize_user(request, request.user)}
        )
    return JsonResponse({"authenticated": False, "user": None})


@require_http_methods(["POST"])
@csrf_exempt
def login_view(request):
    payload = _parse_body(request)
    if payload is None or payload == {}:
        return JsonResponse({"error": "Invalid body", "errors": {"body": ["Empty body"]}}, status=400)

    username = payload.get("username")
    password = payload.get("password")
    if not username or not password:
        return JsonResponse(
            {
                "error": "Username and password are required",
                "errors": {"credentials": ["Username and password are required"]},
            },
            status=400,
        )

    user = authenticate(request, username=username, password=password)
    if user is None:
        return JsonResponse(
            {"error": "Wrong credentials", "errors": {"credentials": ["Wrong credentials"]}},
            status=400,
        )

    login(request, user)
    return JsonResponse({"authenticated": True, "user": _serialize_user(request, user)})


@require_http_methods(["POST"])
@csrf_exempt
def logout_view(request):
    logout(request)
    return JsonResponse({"ok": True})


@require_http_methods(["GET", "POST"])
@csrf_exempt
def register_view(request):
    if request.method == "GET":
        return JsonResponse({"detail": "Use POST with username, password1, password2"}, status=200)

    payload = _parse_body(request)
    if not payload:
        return JsonResponse({"error": "Invalid body", "errors": {"body": ["Empty body"]}}, status=400)

    username = payload.get("username")
    password1 = payload.get("password1")
    password2 = payload.get("password2")

    # Pre-flight validations for clearer messages
    if not username:
        return JsonResponse({"error": "Username required", "errors": {"username": ["Username required"]}}, status=400)
    if User.objects.filter(username=username).exists():
        return JsonResponse(
            {"error": "Username already exists", "errors": {"username": ["Username already exists"]}},
            status=400,
        )
    if not password1 or not password2:
        return JsonResponse(
            {"error": "Password required", "errors": {"password": ["Password required"]}}, status=400
        )
    if password1 != password2:
        return JsonResponse(
            {"error": "Passwords do not match", "errors": {"password": ["Passwords do not match"]}},
            status=400,
        )

    form = UserRegisterForm({
        "username": username,
        "password1": password1,
        "password2": password2,
    })
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
    summary = " ".join(["; ".join(v) for v in errors.values()]) if errors else "Validation error"
    return JsonResponse({"error": summary, "errors": errors}, status=400)


@require_http_methods(["GET", "POST"])
def profile_view(request):
    if not request.user.is_authenticated:
        return JsonResponse({"error": "Authentication required"}, status=401)

    if request.method == "GET":
        return JsonResponse({"user": _serialize_user(request, request.user)})

    u_form = UserUpdateForm(request.POST, instance=request.user)
    p_form = ProfileUpdateForm(
        request.POST, request.FILES, instance=request.user.profile
    )

    if u_form.is_valid() and p_form.is_valid():
        u_form.save()
        p_form.save()
        return JsonResponse({"user": _serialize_user(request, request.user)})

    return JsonResponse({"errors": _collect_errors(u_form.errors, p_form.errors)}, status=400)

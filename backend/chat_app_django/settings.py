
"""Содержит логику модуля `settings` подсистемы `chat_app_django`."""


import os
import secrets
import sys
from pathlib import Path
from urllib.parse import urlparse

from django.core.exceptions import ImproperlyConfigured


BASE_DIR = Path(__file__).resolve().parent.parent


def env_bool(name: str, default: bool) -> bool:
    """Выполняет логику `env_bool` с параметрами из сигнатуры."""
    value = os.getenv(name)
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


def env_list(name: str, default: list[str]) -> list[str]:
    """Выполняет логику `env_list` с параметрами из сигнатуры."""
    value = os.getenv(name)
    if not value:
        return default
    return [item.strip() for item in value.split(",") if item.strip()]


def env_int(name: str, default: int, minimum: int | None = None) -> int:
    """Преобразует значение переменной окружения в целое число."""
    raw = os.getenv(name)
    if raw is None:
        value = default
    else:
        try:
            value = int(raw)
        except ValueError as exc:
            raise ImproperlyConfigured(f"{name} must be an integer.") from exc
    if minimum is not None and value < minimum:
        raise ImproperlyConfigured(f"{name} must be >= {minimum}.")
    return value


DEBUG = env_bool("DJANGO_DEBUG", True)
TESTING = "test" in sys.argv

SECRET_KEY = os.getenv("DJANGO_SECRET_KEY")
if not SECRET_KEY:
    if DEBUG:
        SECRET_KEY = secrets.token_urlsafe(50)
    else:
        raise ImproperlyConfigured("DJANGO_SECRET_KEY must be set in production.")

ALLOWED_HOSTS = env_list(
    "DJANGO_ALLOWED_HOSTS",
    ["localhost", "127.0.0.1"] if DEBUG else [],
)
if not DEBUG and not ALLOWED_HOSTS:
    raise ImproperlyConfigured("DJANGO_ALLOWED_HOSTS must be set in production.")


INSTALLED_APPS = [
    "channels",
    "corsheaders",
    "crispy_forms",
    "crispy_bootstrap4",
    "chat.apps.ChatConfig",
    "users.apps.UsersConfig",
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
]

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "corsheaders.middleware.CorsMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
    "users.middleware.UpdateLastSeenMiddleware",
]

ROOT_URLCONF = "chat_app_django.urls"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.debug",
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
                "chat.context_processors.public_rooms",
            ],
        },
    },
]

WSGI_APPLICATION = "chat_app_django.wsgi.application"
ASGI_APPLICATION = "chat_app_django.asgi.application"


REDIS_URL = os.getenv("REDIS_URL")
REQUIRE_REDIS = env_bool("DJANGO_REQUIRE_REDIS", not DEBUG)
ALLOW_INMEMORY_CHANNEL_LAYER = env_bool("DJANGO_ALLOW_INMEMORY_CHANNEL_LAYER", DEBUG)
if REQUIRE_REDIS and not REDIS_URL:
    raise ImproperlyConfigured("REDIS_URL must be set in production.")

if REDIS_URL:
    CHANNEL_LAYERS = {
        "default": {
            "BACKEND": "channels_redis.core.RedisChannelLayer",
            "CONFIG": {"hosts": [REDIS_URL]},
        }
    }
elif ALLOW_INMEMORY_CHANNEL_LAYER:
    CHANNEL_LAYERS = {
        "default": {
            "BACKEND": "channels.layers.InMemoryChannelLayer",
        }
    }
else:
    raise ImproperlyConfigured(
        "REDIS_URL is required unless DJANGO_ALLOW_INMEMORY_CHANNEL_LAYER=1."
    )


def _database_from_url(url: str) -> dict:
    """Выполняет логику `_database_from_url` с параметрами из сигнатуры."""
    parsed = urlparse(url)
    if parsed.scheme in {"postgres", "postgresql"}:
        return {
            "ENGINE": "django.db.backends.postgresql",
            "NAME": (parsed.path or "").lstrip("/"),
            "USER": parsed.username or "",
            "PASSWORD": parsed.password or "",
            "HOST": parsed.hostname or "",
            "PORT": str(parsed.port or ""),
        }
    raise ImproperlyConfigured("Unsupported DATABASE_URL scheme.")


DATABASE_URL = os.getenv("DATABASE_URL")
if DATABASE_URL:
    DATABASES = {"default": _database_from_url(DATABASE_URL)}
else:
    db_engine = os.getenv("DJANGO_DB_ENGINE", "")
    if db_engine:
        DATABASES = {
            "default": {
                "ENGINE": db_engine,
                "NAME": os.getenv("DJANGO_DB_NAME", ""),
                "USER": os.getenv("DJANGO_DB_USER", ""),
                "PASSWORD": os.getenv("DJANGO_DB_PASSWORD", ""),
                "HOST": os.getenv("DJANGO_DB_HOST", ""),
                "PORT": os.getenv("DJANGO_DB_PORT", ""),
            }
        }
    else:
        sqlite_path = os.getenv("DJANGO_SQLITE_PATH")
        DATABASES = {
            "default": {
                "ENGINE": "django.db.backends.sqlite3",
                "NAME": sqlite_path or (BASE_DIR / "db.sqlite3"),
            }
        }

ALLOW_SQLITE_IN_PROD = env_bool("DJANGO_ALLOW_SQLITE", False)
if (
    not DEBUG
    and DATABASES["default"]["ENGINE"] == "django.db.backends.sqlite3"
    and not ALLOW_SQLITE_IN_PROD
):
    raise ImproperlyConfigured("SQLite is not allowed in production.")


RELAX_PASSWORDS = env_bool("DJANGO_RELAX_PASSWORDS", DEBUG)
if not DEBUG and RELAX_PASSWORDS:
    raise ImproperlyConfigured("DJANGO_RELAX_PASSWORDS cannot be enabled in production.")

if RELAX_PASSWORDS:
    AUTH_PASSWORD_VALIDATORS = [
        {
            "NAME": "django.contrib.auth.password_validation.MinimumLengthValidator",
            "OPTIONS": {"min_length": 6},
        },
    ]
else:
    AUTH_PASSWORD_VALIDATORS = [
        {"NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator"},
        {"NAME": "django.contrib.auth.password_validation.MinimumLengthValidator"},
        {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
        {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
    ]


LANGUAGE_CODE = "ru"
TIME_ZONE = "UTC"
USE_I18N = True
USE_TZ = True

STATIC_URL = "static/"
STATIC_ROOT = os.path.join(BASE_DIR, "staticfiles")
MEDIA_ROOT = os.path.join(BASE_DIR, "media")
MEDIA_URL = "/media/"

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"
CRISPY_TEMPLATE_PACK = "bootstrap4"

LOGIN_REDIRECT_URL = "chat-home"
LOGIN_URL = "login"

CSRF_TRUSTED_ORIGINS = env_list(
    "DJANGO_CSRF_TRUSTED_ORIGINS",
    [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ],
)

CORS_ALLOWED_ORIGINS = env_list(
    "DJANGO_CORS_ALLOWED_ORIGINS",
    [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ],
)
CORS_ALLOW_CREDENTIALS = env_bool("DJANGO_CORS_ALLOW_CREDENTIALS", True)
CORS_URLS_REGEX = r"^/api/.*$"
PUBLIC_BASE_URL = os.getenv("DJANGO_PUBLIC_BASE_URL", "").strip() or None
MEDIA_URL_TTL_SECONDS = env_int("DJANGO_MEDIA_URL_TTL_SECONDS", 300, minimum=1)
MEDIA_SIGNING_KEY = os.getenv("DJANGO_MEDIA_SIGNING_KEY", "").strip() or SECRET_KEY
TRUSTED_PROXY_IPS = env_list("DJANGO_TRUSTED_PROXY_IPS", [])
TRUSTED_PROXY_RANGES = env_list(
    "DJANGO_TRUSTED_PROXY_RANGES",
    [
        "127.0.0.1/32",
        "10.0.0.0/8",
        "172.16.0.0/12",
        "192.168.0.0/16",
        "::1/128",
        "fc00::/7",
    ],
)

SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")
SESSION_COOKIE_SECURE = env_bool("DJANGO_SESSION_COOKIE_SECURE", not DEBUG)
CSRF_COOKIE_SECURE = env_bool("DJANGO_CSRF_COOKIE_SECURE", not DEBUG)
SECURE_SSL_REDIRECT = env_bool("DJANGO_SECURE_SSL_REDIRECT", not DEBUG)

MAX_UPLOAD_SIZE_MB = int(os.getenv("DJANGO_UPLOAD_MAX_MB", "20"))
DATA_UPLOAD_MAX_MEMORY_SIZE = MAX_UPLOAD_SIZE_MB * 1024 * 1024
FILE_UPLOAD_MAX_MEMORY_SIZE = MAX_UPLOAD_SIZE_MB * 1024 * 1024


AUTH_RATE_LIMIT = int(os.getenv("AUTH_RATE_LIMIT", "10"))
AUTH_RATE_WINDOW = int(os.getenv("AUTH_RATE_WINDOW", "60"))
USERNAME_MAX_LENGTH = env_int("USERNAME_MAX_LENGTH", 30, minimum=1)
if USERNAME_MAX_LENGTH > 150:
    raise ImproperlyConfigured("USERNAME_MAX_LENGTH must be <= 150.")
CHAT_MESSAGE_MAX_LENGTH = int(os.getenv("CHAT_MESSAGE_MAX_LENGTH", "1000"))
CHAT_MESSAGE_RATE_LIMIT = int(os.getenv("CHAT_MESSAGE_RATE_LIMIT", "20"))
CHAT_MESSAGE_RATE_WINDOW = int(os.getenv("CHAT_MESSAGE_RATE_WINDOW", "10"))
CHAT_MESSAGES_PAGE_SIZE = int(os.getenv("CHAT_MESSAGES_PAGE_SIZE", "50"))
CHAT_MESSAGES_MAX_PAGE_SIZE = int(os.getenv("CHAT_MESSAGES_MAX_PAGE_SIZE", "200"))
CHAT_WS_IDLE_TIMEOUT = int(os.getenv("CHAT_WS_IDLE_TIMEOUT", "600"))
CHAT_ROOM_SLUG_REGEX = os.getenv("CHAT_ROOM_SLUG_REGEX", r"^[A-Za-z0-9_-]{3,50}$")
CHAT_DIRECT_SLUG_SALT = os.getenv("CHAT_DIRECT_SLUG_SALT", "").strip() or SECRET_KEY
WS_CONNECT_RATE_LIMIT = env_int("WS_CONNECT_RATE_LIMIT", 60, minimum=1)
WS_CONNECT_RATE_WINDOW = env_int("WS_CONNECT_RATE_WINDOW", 60, minimum=1)
PRESENCE_TTL = int(os.getenv("PRESENCE_TTL", "40"))
PRESENCE_GRACE = int(os.getenv("PRESENCE_GRACE", "5"))
PRESENCE_HEARTBEAT = int(os.getenv("PRESENCE_HEARTBEAT", "20"))
PRESENCE_IDLE_TIMEOUT = int(os.getenv("PRESENCE_IDLE_TIMEOUT", "90"))
PRESENCE_TOUCH_INTERVAL = int(os.getenv("PRESENCE_TOUCH_INTERVAL", "30"))

DIRECT_INBOX_UNREAD_TTL = int(os.getenv("DIRECT_INBOX_UNREAD_TTL", str(30 * 24 * 60 * 60)))
DIRECT_INBOX_ACTIVE_TTL = int(os.getenv("DIRECT_INBOX_ACTIVE_TTL", "90"))
DIRECT_INBOX_HEARTBEAT = int(os.getenv("DIRECT_INBOX_HEARTBEAT", "20"))
DIRECT_INBOX_IDLE_TIMEOUT = int(os.getenv("DIRECT_INBOX_IDLE_TIMEOUT", "90"))

if REDIS_URL:
    CACHES = {
        "default": {
            "BACKEND": "django.core.cache.backends.redis.RedisCache",
            "LOCATION": REDIS_URL,
        }
    }
else:
    CACHES = {
        "default": {
            "BACKEND": "django.core.cache.backends.locmem.LocMemCache",
        }
    }


LOG_LEVEL = os.getenv("DJANGO_LOG_LEVEL", "INFO").upper()

LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "formatters": {
        "standard": {
            "format": "%(asctime)s %(levelname)s %(name)s %(message)s",
        },
    },
    "handlers": {
        "console": {
            "class": "logging.StreamHandler",
            "formatter": "standard",
        },
    },
    "root": {
        "handlers": ["console"],
        "level": LOG_LEVEL,
    },
    "loggers": {
        "django": {
            "handlers": ["console"],
            "level": LOG_LEVEL,
            "propagate": False,
        },
        "django.request": {
            "handlers": ["console"],
            "level": "ERROR" if TESTING else "WARNING",
            "propagate": False,
        },
        "chat_app_django.health": {
            "handlers": ["console"],
            "level": "CRITICAL" if TESTING else LOG_LEVEL,
            "propagate": False,
        },
        "chat": {
            "handlers": ["console"],
            "level": LOG_LEVEL,
            "propagate": False,
        },
        "users": {
            "handlers": ["console"],
            "level": LOG_LEVEL,
            "propagate": False,
        },
        "security.audit": {
            "handlers": ["console"],
            "level": "INFO",
            "propagate": False,
        },
    },
}



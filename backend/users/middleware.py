from datetime import timedelta

from django.core.cache import cache
from django.db import OperationalError, ProgrammingError
from django.utils import timezone

from .models import Profile


class UpdateLastSeenMiddleware:
    """
    Обновляет поле last_seen у авторизованных пользователей.
    Чтобы избежать лишних запросов, обновляем не чаще чем раз в 30 секунд.
    """

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        user = getattr(request, "user", None)
        if user and user.is_authenticated:
            try:
                now = timezone.now()
                cache_key = f"last_seen:{user.id}"
                cached = cache.get(cache_key)
                if cached and now - cached <= timedelta(seconds=10):
                    return self.get_response(request)

                Profile.objects.filter(user_id=user.id).update(last_seen=now)
                cache.set(cache_key, now, timeout=60)
            except (OperationalError, ProgrammingError):
                # База без миграции last_seen — просто пропускаем обновление.
                pass
        return self.get_response(request)

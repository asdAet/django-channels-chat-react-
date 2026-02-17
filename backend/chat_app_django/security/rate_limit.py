"""Централизованный сервис персистентного rate-limit на базе БД."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import timedelta

from django.db import IntegrityError, transaction
from django.utils import timezone

from users.models import SecurityRateLimitBucket


@dataclass(frozen=True)
class RateLimitPolicy:
    """Описывает лимит и окно для конкретного security-сценария."""

    limit: int
    window_seconds: int

    def normalized_limit(self) -> int:
        """Возвращает безопасное значение лимита (не меньше 1)."""
        return max(1, int(self.limit))

    def normalized_window(self) -> int:
        """Возвращает безопасное значение окна в секундах (не меньше 1)."""
        return max(1, int(self.window_seconds))


class DbRateLimiter:
    """Инкапсулирует атомарное rate-limit состояние в таблице БД."""

    @classmethod
    def is_limited(cls, scope_key: str, policy: RateLimitPolicy) -> bool:
        """Проверяет и увеличивает счетчик для ключа, возвращая факт блокировки."""
        if not scope_key:
            # Пустой ключ считаем нарушением контракта и блокируем.
            return True

        limit = policy.normalized_limit()
        window = policy.normalized_window()
        now = timezone.now()
        next_reset_at = now + timedelta(seconds=window)

        try:
            with transaction.atomic():
                bucket = (
                    SecurityRateLimitBucket.objects.select_for_update()
                    .filter(scope_key=scope_key)
                    .first()
                )

                if bucket is None:
                    SecurityRateLimitBucket.objects.create(
                        scope_key=scope_key,
                        count=1,
                        reset_at=next_reset_at,
                    )
                    return False

                if bucket.reset_at <= now:
                    bucket.count = 1
                    bucket.reset_at = next_reset_at
                    bucket.save(update_fields=["count", "reset_at", "updated_at"])
                    return False

                if bucket.count >= limit:
                    return True

                bucket.count += 1
                bucket.save(update_fields=["count", "updated_at"])
                return False
        except IntegrityError:
            # При гонке повторяем путь чтения/обновления.
            return cls.is_limited(scope_key, policy)
        except Exception:
            # Security-критичный fail-closed.
            return True


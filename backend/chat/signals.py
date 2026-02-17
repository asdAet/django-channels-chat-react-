"""Security-audit сигналы для моделей chat."""

from __future__ import annotations

from django.db.models.signals import post_delete, post_save
from django.dispatch import receiver

from chat_app_django.security.audit import audit_security_event

from .models import ChatRole


@receiver(post_save, sender=ChatRole)
def audit_chat_role_save(sender, instance: ChatRole, created: bool, **kwargs):
    """Логирует создание/изменение прав доступа пользователя в комнате."""
    audit_security_event(
        "chat.role.created" if created else "chat.role.updated",
        room_slug=getattr(instance.room, "slug", None),
        username=getattr(instance.user, "username", None),
        role=instance.role,
        granted_by=getattr(instance.granted_by, "username", None),
    )


@receiver(post_delete, sender=ChatRole)
def audit_chat_role_delete(sender, instance: ChatRole, **kwargs):
    """Логирует удаление роли пользователя из комнаты."""
    audit_security_event(
        "chat.role.deleted",
        room_slug=getattr(instance.room, "slug", None),
        username=getattr(instance.user, "username", None),
        role=instance.role,
    )


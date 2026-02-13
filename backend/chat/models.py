from django.conf import settings
from django.db import models
from django.utils import timezone


class Message(models.Model):
    username = models.CharField(max_length=50, db_index=True)
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="messages",
    )
    room = models.CharField(max_length=50, db_index=True)
    message_content = models.TextField()
    date_added = models.DateTimeField(default=timezone.now, db_index=True)
    profile_pic = models.CharField(max_length=255, blank=True, null=True)

    class Meta:
        ordering = ("date_added",)
        indexes = [
            models.Index(fields=["room", "date_added"], name="chat_msg_room_date_idx"),
            models.Index(fields=["username", "date_added"], name="chat_msg_user_date_idx"),
        ]

    def __str__(self):
        name = self.user.username if self.user else self.username
        return f"{name}: {self.message_content}"


class Room(models.Model):
    class Kind(models.TextChoices):
        PUBLIC = "public", "Public"
        PRIVATE = "private", "Private"
        DIRECT = "direct", "Direct"

    name = models.CharField(max_length=50, db_index=True)
    slug = models.CharField(max_length=50, unique=True)
    kind = models.CharField(
        max_length=10,
        choices=Kind.choices,
        default=Kind.PRIVATE,
        db_index=True,
    )
    direct_pair_key = models.CharField(
        max_length=64,
        null=True,
        blank=True,
        unique=True,
        db_index=True,
    )
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="created_rooms",
    )

    def __str__(self):
        return str(self.name)


class ChatRole(models.Model):
    class Role(models.TextChoices):
        OWNER = "owner", "Owner"
        ADMIN = "admin", "Admin"
        MEMBER = "member", "Member"
        VIEWER = "viewer", "Viewer"
        BLOCKED = "blocked", "Blocked"

    room = models.ForeignKey(
        Room,
        on_delete=models.CASCADE,
        related_name="roles",
    )
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="chat_roles",
    )
    role = models.CharField(max_length=16, choices=Role.choices, db_index=True)
    username_snapshot = models.CharField(max_length=150, db_index=True)
    granted_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="granted_chat_roles",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["room", "user"], name="chat_role_room_user_uniq"),
        ]
        indexes = [
            models.Index(fields=["room", "role"], name="chat_role_room_role_idx"),
        ]

    def __str__(self):
        return f"{self.room.slug}:{self.user.username}:{self.role}"

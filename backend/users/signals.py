from django.contrib.auth.models import User
from django.db import IntegrityError
from django.db.models.signals import post_save, pre_save
from django.dispatch import receiver

from chat.models import ChatRole, Message

from .models import Profile


@receiver(pre_save, sender=User)
def remember_previous_username(sender, instance, **kwargs):
    if kwargs.get("raw", False):
        return
    if not instance.pk:
        instance._old_username = None
        return
    old_username = (
        User.objects.filter(pk=instance.pk)
        .values_list("username", flat=True)
        .first()
    )
    instance._old_username = old_username


@receiver(post_save, sender=User)
def ensure_profile(sender, instance, **kwargs):
    if kwargs.get("raw", False):
        return
    try:
        Profile.objects.get_or_create(user=instance)
    except IntegrityError:
        # Another concurrent save may create the same one-to-one profile first.
        Profile.objects.filter(user=instance).first()


@receiver(post_save, sender=User)
def sync_chat_username_snapshots(sender, instance, **kwargs):
    if kwargs.get("raw", False):
        return
    old_username = getattr(instance, "_old_username", None)
    if not old_username or old_username == instance.username:
        return

    Message.objects.filter(user=instance).exclude(username=instance.username).update(
        username=instance.username
    )
    ChatRole.objects.filter(user=instance).exclude(
        username_snapshot=instance.username
    ).update(username_snapshot=instance.username)

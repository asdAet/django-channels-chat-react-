from django.db import models
from django.conf import settings

# Create your models here.


class Message(models.Model):
    username = models.CharField(max_length=50)
    room = models.CharField(max_length=50)
    message_content = models.TextField()
    date_added = models.DateTimeField(auto_now_add=True)
    profile_pic = models.ImageField()

    class Meta:
        ordering = ('date_added', )

    def __str__(self):
        return f"{self.username}: {self.message_content}"


class Room(models.Model):
    name = models.CharField(max_length=50)
    # for url
    slug = models.CharField(max_length=50, unique=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="created_rooms",
    )

    def __str__(self):
        return str(self.name)

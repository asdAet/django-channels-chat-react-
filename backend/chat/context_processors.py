"""
Context processor for adding public rooms to base template
"""
from .constants import PUBLIC_ROOM_NAME, PUBLIC_ROOM_SLUG
from .models import Room


def public_rooms(request):
    # Обеспечиваем наличие общей публичной комнаты, чтобы она всегда была видна в сайдбаре.
    Room.objects.get_or_create(slug=PUBLIC_ROOM_SLUG, defaults={"name": PUBLIC_ROOM_NAME})
    rooms = Room.objects.all()
    return {'rooms': rooms}

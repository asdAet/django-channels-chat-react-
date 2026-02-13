from django.urls import path

from . import api

urlpatterns = [
    path("public-room/", api.public_room, name="api-public-room"),
    path("direct/start/", api.direct_start, name="api-direct-start"),
    path("direct/chats/", api.direct_chats, name="api-direct-chats"),
    path("rooms/<path:room_slug>/messages/", api.room_messages, name="api-room-messages"),
    path("rooms/<path:room_slug>/", api.room_details, name="api-room-details"),
]

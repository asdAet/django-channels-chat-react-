"""
This file is for routing to the consumer
"""
from django.urls import re_path

from . import consumers

websocket_urlpatterns = [
    # Accept full tail and let ChatConsumer validate room slug explicitly.
    re_path(r"ws/chat/(?P<room_name>.+)/$", consumers.ChatConsumer.as_asgi()),
    re_path(r"ws/presence/$", consumers.PresenceConsumer.as_asgi()),
    re_path(r"ws/direct/inbox/$", consumers.DirectInboxConsumer.as_asgi()),
]

from django.contrib import admin
from django.urls import path, include
from . import views as chat_views

urlpatterns = [
    path('', chat_views.chat_home, name='chat-home'),
    path('public/', chat_views.public_chat, name='public-chat'),
    path('<str:room_name>/', chat_views.chat_room, name='chat-room'),
]

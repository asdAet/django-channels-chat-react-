from django.contrib import admin

from .models import ChatRole, Message, Room


@admin.register(Room)
class RoomAdmin(admin.ModelAdmin):
    list_display = ("name", "slug", "kind", "direct_pair_key", "created_by")
    prepopulated_fields = {"slug": ("name",)}
    search_fields = ("name", "slug", "direct_pair_key")
    list_filter = ("kind",)


@admin.register(ChatRole)
class ChatRoleAdmin(admin.ModelAdmin):
    list_display = ("room", "user", "role", "username_snapshot", "granted_by", "created_at")
    search_fields = ("room__slug", "user__username", "username_snapshot")
    list_filter = ("role", "room__kind")


@admin.register(Message)
class MessageAdmin(admin.ModelAdmin):
    list_display = ("username", "user", "room", "short_message", "date_added")
    list_filter = ("room", "date_added", "user")
    search_fields = ("username", "user__username", "message_content", "room")
    date_hierarchy = "date_added"
    fields = ("username", "user", "room", "message_content", "profile_pic", "date_added")

    @admin.display(description="Message")
    def short_message(self, obj):
        if obj.message_content:
            return (obj.message_content[:50] + "...") if len(obj.message_content) > 50 else obj.message_content
        return ""

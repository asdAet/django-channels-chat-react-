from django.contrib import admin

from .models import Message, Room


@admin.register(Room)
class RoomAdmin(admin.ModelAdmin):
    list_display = ("name", "slug")
    prepopulated_fields = {"slug": ("name",)}
    search_fields = ("name", "slug")
    


@admin.register(Message)
class MessageAdmin(admin.ModelAdmin):
    list_display = ("username", "room", "short_message", "date_added")
    list_filter = ("room", "date_added")
    search_fields = ("username", "message_content", "room__name")
    date_hierarchy = "date_added"

    @admin.display(description="Message")
    def short_message(self, obj):
        if obj.message_content:
            return (obj.message_content[:50] + "...") if len(obj.message_content) > 50 else obj.message_content
        return ""

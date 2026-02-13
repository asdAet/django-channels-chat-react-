from django.db import migrations


PUBLIC_ROOM_SLUG = "public"


def seed_room_kinds_and_owner_roles(apps, schema_editor):
    Room = apps.get_model("chat", "Room")
    ChatRole = apps.get_model("chat", "ChatRole")

    rooms = Room.objects.all().select_related("created_by")
    for room in rooms.iterator():
        desired_kind = "public" if room.slug == PUBLIC_ROOM_SLUG else "private"
        if room.kind != desired_kind:
            room.kind = desired_kind
            room.save(update_fields=["kind"])

        if not room.created_by_id:
            continue

        username_snapshot = ""
        if getattr(room, "created_by", None):
            username_snapshot = getattr(room.created_by, "username", "") or ""
        if not username_snapshot:
            username_snapshot = f"user_{room.created_by_id}"

        role_obj, _ = ChatRole.objects.get_or_create(
            room_id=room.id,
            user_id=room.created_by_id,
            defaults={
                "role": "owner",
                "username_snapshot": username_snapshot,
                "granted_by_id": room.created_by_id,
            },
        )
        changed_fields = []
        if role_obj.username_snapshot != username_snapshot:
            role_obj.username_snapshot = username_snapshot
            changed_fields.append("username_snapshot")
        if changed_fields:
            role_obj.save(update_fields=changed_fields)


def noop_reverse(apps, schema_editor):
    return


class Migration(migrations.Migration):

    dependencies = [
        ("chat", "0008_room_direct_pair_key_room_kind_chatrole_and_more"),
    ]

    operations = [
        migrations.RunPython(seed_room_kinds_and_owner_roles, noop_reverse),
    ]

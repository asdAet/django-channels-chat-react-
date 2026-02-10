from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("users", "0002_profile_last_seen"),
    ]

    operations = [
        migrations.AddField(
            model_name="profile",
            name="bio",
            field=models.TextField(blank=True, max_length=1000),
        ),
    ]

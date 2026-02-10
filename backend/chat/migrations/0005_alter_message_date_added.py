from django.db import migrations, models
import django.utils.timezone


class Migration(migrations.Migration):

    dependencies = [
        ("chat", "0004_message_profile_pic_charfield"),
    ]

    operations = [
        migrations.AlterField(
            model_name="message",
            name="date_added",
            field=models.DateTimeField(default=django.utils.timezone.now),
        ),
    ]

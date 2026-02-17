"""Добавляет таблицу персистентного security rate-limit."""

from django.db import migrations, models


class Migration(migrations.Migration):
    """Описывает операции миграции схемы данных."""

    dependencies = [
        ("users", "0003_profile_bio"),
    ]

    operations = [
        migrations.CreateModel(
            name="SecurityRateLimitBucket",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("scope_key", models.CharField(db_index=True, max_length=191, unique=True)),
                ("count", models.PositiveIntegerField(default=0)),
                ("reset_at", models.DateTimeField(db_index=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
            ],
        ),
        migrations.AddIndex(
            model_name="securityratelimitbucket",
            index=models.Index(fields=["reset_at"], name="users_rl_reset_idx"),
        ),
    ]


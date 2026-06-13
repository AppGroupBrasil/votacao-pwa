import django.db.models.fields
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("eleitores", "0009_eleitor_votos_permitidos"),
    ]

    operations = [
        migrations.AddField(
            model_name="eleitor",
            name="central_id",
            field=models.UUIDField(
                blank=True,
                null=True,
                unique=True,
                help_text="ID do morador na central (auth-central) — mapeia o sync de cadastro.",
            ),
        ),
    ]

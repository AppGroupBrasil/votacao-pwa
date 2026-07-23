from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("assembleias", "0017_assembleia_exigir_confirmacao_email"),
    ]

    operations = [
        migrations.AddField(
            model_name="presenca",
            name="inadimplente",
            field=models.BooleanField(
                default=False,
                help_text="Marcado pelo gestor na lista de presença; realça a linha.",
            ),
        ),
    ]

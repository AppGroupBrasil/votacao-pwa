from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("enquetes", "0008_presencamanual_identidade"),
    ]

    operations = [
        migrations.AddConstraint(
            model_name="presencamanual",
            constraint=models.UniqueConstraint(
                condition=models.Q(("identidade__isnull", False)),
                fields=("lista", "identidade"),
                name="unique_presenca_identidade_por_lista",
            ),
        ),
    ]

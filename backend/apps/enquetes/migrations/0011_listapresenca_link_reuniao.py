from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('enquetes', '0010_enquete_exige_identificacao'),
    ]

    operations = [
        migrations.AddField(
            model_name='listapresenca',
            name='link_reuniao',
            field=models.URLField(
                blank=True,
                default='',
                help_text=(
                    'Link da sala da assembleia (Meet, Zoom, YouTube ao vivo, etc.). '
                    'Só é entregue ao morador depois que ele registra a presença.'
                ),
            ),
        ),
    ]

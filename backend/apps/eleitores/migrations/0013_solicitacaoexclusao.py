import uuid

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("eleitores", "0012_cpf_hash_nao_unico_email_opcional"),
    ]

    operations = [
        migrations.CreateModel(
            name="SolicitacaoExclusao",
            fields=[
                (
                    "id",
                    models.UUIDField(
                        default=uuid.uuid4,
                        editable=False,
                        primary_key=True,
                        serialize=False,
                    ),
                ),
                ("nome", models.CharField(max_length=200)),
                (
                    "cpf",
                    models.CharField(
                        blank=True,
                        default="",
                        help_text="CPF informado pelo morador para localizar o cadastro.",
                        max_length=20,
                    ),
                ),
                ("email", models.EmailField(blank=True, default="", max_length=200)),
                ("condominio", models.CharField(blank=True, default="", max_length=200)),
                ("motivo", models.TextField(blank=True, default="")),
                (
                    "status",
                    models.CharField(
                        choices=[
                            ("pendente", "Pendente"),
                            ("concluida", "Concluída"),
                            ("recusada", "Recusada"),
                        ],
                        default="pendente",
                        max_length=20,
                    ),
                ),
                ("observacao_admin", models.TextField(blank=True, default="")),
                ("ip_address", models.GenericIPAddressField(blank=True, null=True)),
                ("user_agent", models.TextField(blank=True, default="")),
                ("criado_em", models.DateTimeField(auto_now_add=True)),
                ("processada_em", models.DateTimeField(blank=True, null=True)),
            ],
            options={
                "verbose_name": "Solicitação de exclusão",
                "verbose_name_plural": "Solicitações de exclusão",
                "ordering": ["-criado_em"],
            },
        ),
    ]

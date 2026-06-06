from rest_framework import serializers

from .models import Eleitor


class EleitorSerializer(serializers.ModelSerializer):
    condominio_nome = serializers.CharField(
        source="condominio.nome", read_only=True
    )
    cpf_hash = serializers.CharField(
        max_length=64, required=False, allow_blank=True, allow_null=True
    )

    def validate_cpf_hash(self, value):
        # CPF é opcional; vazio vira NULL para não colidir no índice único.
        return value or None

    class Meta:
        model = Eleitor
        fields = [
            "id",
            "condominio",
            "condominio_nome",
            "nome",
            "cpf_hash",
            "bloco",
            "apartamento",
            "email",
            "cadastro_completo",
            "bloqueado",
            "inadimplente",
            "votos_permitidos",
            "criado_em",
            "atualizado_em",
        ]
        read_only_fields = ["id", "criado_em", "atualizado_em", "cadastro_completo"]


class EleitorOnboardingSerializer(serializers.Serializer):
    biometria_hash = serializers.CharField(max_length=64)
    webauthn_credential = serializers.JSONField(required=False)

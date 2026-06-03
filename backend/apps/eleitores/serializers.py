from rest_framework import serializers

from .models import Eleitor


class EleitorSerializer(serializers.ModelSerializer):
    condominio_nome = serializers.CharField(
        source="condominio.nome", read_only=True
    )

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
            "criado_em",
            "atualizado_em",
        ]
        read_only_fields = ["id", "criado_em", "atualizado_em", "cadastro_completo"]


class EleitorOnboardingSerializer(serializers.Serializer):
    biometria_hash = serializers.CharField(max_length=64)
    webauthn_credential = serializers.JSONField(required=False)

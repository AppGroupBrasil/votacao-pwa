from rest_framework import serializers

from .models import Eleitor, SolicitacaoExclusao


class EleitorSerializer(serializers.ModelSerializer):
    condominio_nome = serializers.CharField(
        source="condominio.nome", read_only=True
    )
    cpf_hash = serializers.CharField(
        max_length=64, required=False, allow_blank=True, allow_null=True
    )
    email = serializers.EmailField(required=False, allow_blank=True)

    def validate_cpf_hash(self, value):
        # CPF é opcional; vazio vira NULL (o campo não é mais único, mas manter
        # NULL evita agrupar todo mundo sem CPF sob o mesmo hash de vazio).
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


class SolicitacaoExclusaoSerializer(serializers.ModelSerializer):
    status_display = serializers.CharField(
        source="get_status_display", read_only=True
    )

    class Meta:
        model = SolicitacaoExclusao
        fields = [
            "id",
            "nome",
            "cpf",
            "email",
            "condominio",
            "motivo",
            "status",
            "status_display",
            "observacao_admin",
            "criado_em",
            "processada_em",
        ]
        read_only_fields = ["id", "criado_em", "processada_em", "status_display"]

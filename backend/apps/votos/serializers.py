from rest_framework import serializers

from apps.assembleias.models import Assembleia
from .models import Voto


class VotoSerializer(serializers.ModelSerializer):
    class Meta:
        model = Voto
        fields = [
            "id",
            "assembleia",
            "questao",
            "opcao_escolhida",
            "metodo_auth",
            "hash_voto",
            "timestamp",
        ]
        read_only_fields = ["id", "hash_voto", "timestamp"]


class VotoCreateSerializer(serializers.Serializer):
    eleitor_id = serializers.UUIDField(required=False)
    questao_id = serializers.UUIDField()
    opcao_id = serializers.UUIDField()
    auth_token = serializers.CharField()
    device_id = serializers.CharField(required=False, allow_blank=True, max_length=64)
    por_procuracao = serializers.BooleanField(required=False, default=False)
    unidade_declarada = serializers.BooleanField(required=False, default=False)
    decl_bloco = serializers.CharField(required=False, allow_blank=True, max_length=20)
    decl_apartamento = serializers.CharField(required=False, allow_blank=True, max_length=20)
    decl_nome = serializers.CharField(required=False, allow_blank=True, max_length=200)
    grupo_declaracao = serializers.UUIDField(required=False, allow_null=True)


class ResultadoQuestaoSerializer(serializers.Serializer):
    questao_id = serializers.UUIDField()
    questao_titulo = serializers.CharField()
    total_votos = serializers.IntegerField()
    opcoes = serializers.ListField()


class ComprovanteSerializer(serializers.Serializer):
    hash_voto = serializers.CharField()
    questao = serializers.CharField()
    timestamp = serializers.DateTimeField()
    metodo_auth = serializers.CharField()


class RelatorioVotoSerializer(serializers.ModelSerializer):
    eleitor_nome = serializers.CharField(source="eleitor.nome", read_only=True)
    bloco = serializers.CharField(source="eleitor.bloco", read_only=True)
    apartamento = serializers.CharField(source="eleitor.apartamento", read_only=True)
    perfil = serializers.CharField(source="eleitor.perfil", read_only=True)
    por_procuracao = serializers.SerializerMethodField()
    questao_titulo = serializers.CharField(source="questao.titulo", read_only=True)
    opcao_texto = serializers.CharField(source="opcao_escolhida.texto", read_only=True)
    tipo_autenticacao = serializers.CharField(source="metodo_auth", read_only=True)

    class Meta:
        model = Voto
        fields = [
            "id",
            "eleitor_nome",
            "bloco",
            "apartamento",
            "perfil",
            "por_procuracao",
            "questao_titulo",
            "opcao_texto",
            "tipo_autenticacao",
            "timestamp",
            "hash_voto",
        ]

    def get_por_procuracao(self, obj):
        return obj.por_procuracao or obj.eleitor.perfil == "procurador"

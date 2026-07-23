import json

from rest_framework import serializers

from .models import Assembleia, Ata, LogAuditoria, OpcaoVoto, Presenca, Questao


class LogAuditoriaSerializer(serializers.ModelSerializer):
    acao_display = serializers.CharField(source="get_acao_display", read_only=True)

    class Meta:
        model = LogAuditoria
        fields = [
            "id", "acao", "acao_display", "descricao",
            "ator", "ip_address", "criado_em",
        ]


class AtaSerializer(serializers.ModelSerializer):
    class Meta:
        model = Ata
        fields = [
            "id",
            "assembleia",
            "link_gravacao",
            "transcricao",
            "resumo",
            "ata_texto",
            "provedor_ia",
            "status",
            "erro_mensagem",
            "criado_em",
            "atualizado_em",
        ]
        read_only_fields = [
            "id", "assembleia", "status", "erro_mensagem",
            "criado_em", "atualizado_em",
        ]


class PresencaSerializer(serializers.ModelSerializer):
    class Meta:
        model = Presenca
        fields = [
            "id", "eleitor", "nome", "bloco", "apartamento",
            "perfil", "metodo_auth", "assinatura_facial",
            "ip_address", "device_info", "user_agent", "inadimplente",
            "horario_entrada",
        ]
        read_only_fields = fields


class OpcaoVotoSerializer(serializers.ModelSerializer):
    imagem_url = serializers.SerializerMethodField()
    arquivo_url = serializers.SerializerMethodField()

    class Meta:
        model = OpcaoVoto
        fields = ["id", "texto", "ordem", "imagem_url", "arquivo_url", "link_externo"]
        read_only_fields = ["id"]

    def get_imagem_url(self, obj):
        if obj.imagem:
            request = self.context.get("request")
            if request:
                return request.build_absolute_uri(obj.imagem.url)
            return obj.imagem.url
        return None

    def get_arquivo_url(self, obj):
        if obj.arquivo:
            request = self.context.get("request")
            if request:
                return request.build_absolute_uri(obj.arquivo.url)
            return obj.arquivo.url
        return None


class QuestaoSerializer(serializers.ModelSerializer):
    opcoes = OpcaoVotoSerializer(many=True, read_only=True)

    class Meta:
        model = Questao
        fields = ["id", "titulo", "descricao", "ordem", "encerrada", "opcoes"]
        read_only_fields = ["id"]


class QuestaoCreateSerializer(serializers.ModelSerializer):
    opcoes_json = serializers.CharField(write_only=True, required=False, default="[]")

    class Meta:
        model = Questao
        fields = ["id", "titulo", "descricao", "ordem", "opcoes_json"]
        read_only_fields = ["id"]

    def _save_opcoes(self, questao, opcoes_data, files):
        for i, opcao_data in enumerate(opcoes_data):
            opcao = OpcaoVoto.objects.create(
                questao=questao,
                texto=opcao_data.get("texto", ""),
                ordem=opcao_data.get("ordem", 0),
                link_externo=opcao_data.get("link_externo", ""),
            )
            img_key = f"opcao_imagem_{i}"
            arq_key = f"opcao_arquivo_{i}"
            if img_key in files:
                opcao.imagem = files[img_key]
            if arq_key in files:
                opcao.arquivo = files[arq_key]
            if img_key in files or arq_key in files:
                opcao.save()

    def create(self, validated_data):
        opcoes_raw = validated_data.pop("opcoes_json", "[]")
        try:
            opcoes_data = json.loads(opcoes_raw) if isinstance(opcoes_raw, str) else opcoes_raw
        except (json.JSONDecodeError, TypeError):
            opcoes_data = []
        questao = Questao.objects.create(**validated_data)
        files = self.context.get("request").FILES if self.context.get("request") else {}
        self._save_opcoes(questao, opcoes_data, files)
        return questao

    def update(self, instance, validated_data):
        opcoes_raw = validated_data.pop("opcoes_json", None)
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        instance.save()
        if opcoes_raw is not None:
            try:
                opcoes_data = json.loads(opcoes_raw) if isinstance(opcoes_raw, str) else opcoes_raw
            except (json.JSONDecodeError, TypeError):
                opcoes_data = []
            instance.opcoes.all().delete()
            files = self.context.get("request").FILES if self.context.get("request") else {}
            self._save_opcoes(instance, opcoes_data, files)
        return instance


class AssembleiaSerializer(serializers.ModelSerializer):
    questoes = QuestaoSerializer(many=True, read_only=True)
    presencas = PresencaSerializer(many=True, read_only=True)
    total_votantes = serializers.SerializerMethodField()
    total_presentes = serializers.SerializerMethodField()
    quorum = serializers.SerializerMethodField()
    condominio_nome = serializers.CharField(
        source="condominio.nome", read_only=True
    )

    class Meta:
        model = Assembleia
        fields = [
            "id",
            "codigo_curto",
            "condominio",
            "condominio_nome",
            "titulo",
            "descricao",
            "data_inicio",
            "data_fim",
            "status",
            "votacao_liberada",
            "modo_multiplas_unidades",
            "quorum_minimo",
            "primeira_chamada_50_mais_1",
            "quorum_segunda_chamada",
            "segunda_chamada_qualquer_numero",
            "exigir_confirmacao_email",
            "total_votantes",
            "total_presentes",
            "quorum",
            "questoes",
            "presencas",
            "criado_em",
            "atualizado_em",
        ]
        read_only_fields = ["id", "codigo_curto", "criado_em", "atualizado_em"]

    def get_total_votantes(self, obj):
        return self._base_eleitores(obj)

    def get_total_presentes(self, obj):
        return obj.presencas.count()

    def _base_eleitores(self, obj):
        total = obj.votantes.count()
        if total == 0:
            total = obj.condominio.eleitores.count()
        return total

    def get_quorum(self, obj):
        import math

        base = self._base_eleitores(obj)
        presentes = obj.presencas.count()

        if obj.primeira_chamada_50_mais_1:
            necessario_1 = base // 2 + 1 if base else 0
        else:
            necessario_1 = math.ceil(base * obj.quorum_minimo / 100) if base else 0

        if obj.segunda_chamada_qualquer_numero:
            necessario_2 = 1 if base else 0
        else:
            necessario_2 = math.ceil(base * obj.quorum_segunda_chamada / 100) if base else 0

        percentual = round(presentes / base * 100, 1) if base else 0
        return {
            "base_eleitores": base,
            "presentes": presentes,
            "percentual": percentual,
            "necessario_primeira": necessario_1,
            "necessario_segunda": necessario_2,
            "atingido_primeira": presentes >= necessario_1 and base > 0,
            "atingido_segunda": presentes >= necessario_2 and base > 0,
            "regra_primeira": "50% + 1" if obj.primeira_chamada_50_mais_1 else f"{obj.quorum_minimo}%",
            "regra_segunda": "qualquer número" if obj.segunda_chamada_qualquer_numero else f"{obj.quorum_segunda_chamada}%",
        }


class AssembleiaListSerializer(serializers.ModelSerializer):
    total_votantes = serializers.SerializerMethodField()
    total_questoes = serializers.SerializerMethodField()
    condominio_nome = serializers.CharField(
        source="condominio.nome", read_only=True
    )

    class Meta:
        model = Assembleia
        fields = [
            "id",
            "condominio",
            "condominio_nome",
            "titulo",
            "data_inicio",
            "data_fim",
            "status",
            "votacao_liberada",
            "quorum_minimo",
            "primeira_chamada_50_mais_1",
            "quorum_segunda_chamada",
            "segunda_chamada_qualquer_numero",
            "exigir_confirmacao_email",
            "total_votantes",
            "total_questoes",
            "criado_em",
        ]

    def get_total_votantes(self, obj):
        return obj.votantes.count()

    def get_total_questoes(self, obj):
        return obj.questoes.count()

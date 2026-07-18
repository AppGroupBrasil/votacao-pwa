from rest_framework import serializers

from .models import Enquete, EnqueteOpcao, ListaPresenca, PresencaManual


class EnqueteOpcaoSerializer(serializers.ModelSerializer):
    class Meta:
        model = EnqueteOpcao
        fields = ["id", "texto", "ordem"]


class EnqueteSerializer(serializers.ModelSerializer):
    opcoes = EnqueteOpcaoSerializer(many=True, read_only=True)
    opcoes_texto = serializers.ListField(
        child=serializers.CharField(max_length=255),
        write_only=True,
        required=False,
    )
    total_votos = serializers.SerializerMethodField()

    class Meta:
        model = Enquete
        fields = [
            "id",
            "codigo_curto",
            "condominio",
            "titulo",
            "ativa",
            "voto_aberto",
            "criado_em",
            "opcoes",
            "opcoes_texto",
            "total_votos",
        ]
        read_only_fields = ["id", "codigo_curto", "criado_em"]

    def get_total_votos(self, obj):
        return obj.votos.count()

    def validate_opcoes_texto(self, value):
        limpo = [t.strip() for t in value if t and t.strip()]
        if len(limpo) < 2:
            raise serializers.ValidationError(
                "Informe pelo menos duas respostas."
            )
        return limpo

    def create(self, validated_data):
        opcoes_texto = validated_data.pop("opcoes_texto", [])
        enquete = Enquete.objects.create(**validated_data)
        EnqueteOpcao.objects.bulk_create(
            [
                EnqueteOpcao(enquete=enquete, texto=texto, ordem=i)
                for i, texto in enumerate(opcoes_texto)
            ]
        )
        return enquete

    def update(self, instance, validated_data):
        opcoes_texto = validated_data.pop("opcoes_texto", None)
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        instance.save()
        if opcoes_texto is not None:
            instance.opcoes.all().delete()
            EnqueteOpcao.objects.bulk_create(
                [
                    EnqueteOpcao(enquete=instance, texto=texto, ordem=i)
                    for i, texto in enumerate(opcoes_texto)
                ]
            )
        return instance


class PresencaManualSerializer(serializers.ModelSerializer):
    class Meta:
        model = PresencaManual
        fields = [
            "id",
            "nome",
            "bloco",
            "apartamento",
            "selfie",
            "assinatura",
            "criado_em",
        ]


class ListaPresencaSerializer(serializers.ModelSerializer):
    total_registros = serializers.SerializerMethodField()

    class Meta:
        model = ListaPresenca
        fields = [
            "id",
            "codigo_curto",
            "condominio",
            "titulo",
            "descricao",
            "ativa",
            "criado_em",
            "total_registros",
        ]
        read_only_fields = ["id", "codigo_curto", "criado_em"]

    def get_total_registros(self, obj):
        return obj.registros.count()

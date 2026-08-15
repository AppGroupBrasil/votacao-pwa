"""Apaga os rostos cadastrados para o condomínio recomeçar do zero.

A base de rostos da assembleia de 08/08/2026 foi montada com busca 1:N e com
descritores tirados de fotos ruins (rosto escuro, pequeno, de lado) e com a
média das leituras. Isso contaminou os vetores: um rosto passou a casar com o
nome de outra pessoa. Vetor errado não tem conserto — o único caminho é apagar
e recadastrar, agora pelo CPF (o rosto só confirma).

Apaga SÓ os rostos. Moradores, presenças e votos ficam como estão: a presença
já registrada continua valendo como histórico da assembleia.
"""

from django.core.management.base import BaseCommand, CommandError
from django.db.models import Q

from apps.condominios.models import Condominio
from apps.eleitores.models import IdentidadeFacial


class Command(BaseCommand):
    help = "Apaga as identidades faciais de um condomínio (recadastro do zero)."

    def add_arguments(self, parser):
        parser.add_argument(
            "--condominio",
            default="",
            help="ID ou parte do nome do condomínio.",
        )
        parser.add_argument(
            "--todos",
            action="store_true",
            help="Apaga os rostos de TODOS os condomínios.",
        )
        parser.add_argument(
            "--sim",
            action="store_true",
            help="Confirma. Sem isto, só mostra o que seria apagado.",
        )

    def handle(self, *args, **opts):
        alvo = (opts["condominio"] or "").strip()
        if not alvo and not opts["todos"]:
            raise CommandError("Informe --condominio <id ou nome> ou --todos.")

        qs = IdentidadeFacial.objects.all()
        titulo = "todos os condomínios"

        if alvo:
            condominios = Condominio.objects.filter(nome__icontains=alvo)
            if len(alvo) >= 8:
                condominios = Condominio.objects.filter(
                    Q(nome__icontains=alvo) | Q(id__iexact=alvo)
                )
            achados = list(condominios[:5])
            if not achados:
                raise CommandError(f"Nenhum condomínio encontrado para '{alvo}'.")
            if len(achados) > 1:
                nomes = "\n  ".join(f"{c.nome} ({c.id})" for c in achados)
                raise CommandError(
                    f"'{alvo}' bate com mais de um condomínio:\n  {nomes}\n"
                    "Rode de novo usando o ID."
                )
            condominio = achados[0]
            qs = qs.filter(condominio=condominio)
            titulo = f"{condominio.nome}"

        total = qs.count()
        if not total:
            self.stdout.write(f"Nenhum rosto cadastrado em {titulo}. Nada a fazer.")
            return

        if not opts["sim"]:
            self.stdout.write(
                self.style.WARNING(
                    f"{total} rosto(s) cadastrado(s) em {titulo} SERIAM apagados.\n"
                    "Rode de novo com --sim para apagar de verdade."
                )
            )
            for i in qs.order_by("nome").values_list("nome", "bloco", "apartamento")[:10]:
                self.stdout.write(f"  - {i[0]} ({i[1]} {i[2]})".rstrip())
            if total > 10:
                self.stdout.write(f"  ... e mais {total - 10}.")
            return

        qs.delete()
        self.stdout.write(
            self.style.SUCCESS(
                f"{total} rosto(s) apagado(s) em {titulo}. "
                "Os moradores se recadastram na próxima assembleia, pelo CPF."
            )
        )

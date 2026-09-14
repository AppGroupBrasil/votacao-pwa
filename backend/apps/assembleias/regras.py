"""Regra "somente cadastro antecipado".

Com a regra ligada numa assembleia, o cadastro do rosto fecha algumas horas
antes do início e não reabre na hora: entra quem já tem o rosto cadastrado.
Assim a administração tem tempo de conferir, antes do dia, quem é proprietário,
quem vem com procuração e quais unidades estão inadimplentes.

A regra vale para o condomínio inteiro enquanto a assembleia não termina — o
link do cadastro, a entrada da votação e a lista de presença facial. As listas
de presença não apontam para uma assembleia; por isso a trava é do condomínio.
"""
from dataclasses import dataclass
from datetime import datetime, timedelta

from django.utils import timezone

# Assembleia que ninguém encerrou no painel não trava o cadastro para sempre.
FOLGA_APOS_FIM = timedelta(hours=24)


@dataclass
class RegraCadastro:
    assembleia_id: str
    assembleia_titulo: str
    prazo: datetime
    fechado: bool

    @property
    def prazo_texto(self):
        return timezone.localtime(self.prazo).strftime("%d/%m às %H:%M")

    @property
    def mensagem_fechado(self):
        return (
            f"O cadastro para a assembleia \"{self.assembleia_titulo}\" fechou em "
            f"{self.prazo_texto}. Só participa quem se cadastrou com antecedência; "
            "não é possível se cadastrar na hora. Procure a administração do "
            "condomínio."
        )

    def como_dict(self):
        return {
            "assembleia_id": self.assembleia_id,
            "assembleia_titulo": self.assembleia_titulo,
            "prazo": self.prazo.isoformat(),
            "fechado": self.fechado,
        }


def regra_cadastro(condominio_id, agora=None):
    """A regra que vale agora para o condomínio, ou None se nenhuma assembleia
    em andamento ou marcada tem a regra ligada.

    Com mais de uma, vale a que já fechou o cadastro; se nenhuma fechou, a de
    prazo mais próximo (é o prazo que o morador precisa ver)."""
    from .models import Assembleia

    if not condominio_id:
        return None
    agora = agora or timezone.now()
    candidatas = (
        Assembleia.objects.filter(
            condominio_id=condominio_id,
            somente_cadastro_antecipado=True,
            data_fim__gte=agora - FOLGA_APOS_FIM,
        )
        .exclude(status=Assembleia.Status.ENCERRADA)
        .only("id", "titulo", "data_inicio", "cadastro_antecedencia_horas")
    )
    escolhida = None
    for a in candidatas:
        regra = RegraCadastro(
            assembleia_id=str(a.id),
            assembleia_titulo=a.titulo,
            prazo=a.prazo_cadastro,
            fechado=agora >= a.prazo_cadastro,
        )
        if escolhida is None:
            escolhida = regra
        elif regra.fechado and not escolhida.fechado:
            escolhida = regra
        elif regra.fechado == escolhida.fechado and regra.prazo < escolhida.prazo:
            escolhida = regra
    return escolhida


def cadastro_fechado(condominio_id, agora=None):
    """A regra fechada (para montar a recusa) ou None se o cadastro está aberto."""
    regra = regra_cadastro(condominio_id, agora)
    return regra if regra and regra.fechado else None

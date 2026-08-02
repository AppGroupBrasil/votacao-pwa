"""Os três relatórios oficiais da assembleia, em PDF (reportlab).

1. Lista de presença — quem esteve na assembleia.
2. Votação — auditoria voto a voto (quem votou em quê, como se autenticou).
3. Resultado — a apuração por questão, com percentual e opção vencedora.

Todos usam a mesma moldura (faixa colorida no topo, rodapé com data e
número de página) e a paleta do site (primary = indigo #4f46e5), para o
documento impresso ter a mesma cara do painel.
"""

import io

from django.utils import timezone
from reportlab.lib import colors
from reportlab.lib.colors import HexColor
from reportlab.lib.enums import TA_CENTER, TA_RIGHT
from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import cm
from reportlab.platypus import (
    KeepTogether,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)

from apps.votos.models import Voto

# Mesma paleta do frontend (tailwind.config.js): primary indigo + slate.
COR_PRIMARIA = HexColor("#4f46e5")
COR_PRIMARIA_ESCURA = HexColor("#3730a3")
COR_PRIMARIA_CLARA = HexColor("#eef2ff")
COR_TEXTO = HexColor("#0f172a")
COR_SUAVE = HexColor("#64748b")
COR_LINHA = HexColor("#e2e8f0")
COR_ZEBRA = HexColor("#f8fafc")
COR_VERDE = HexColor("#16a34a")
COR_VERDE_CLARA = HexColor("#dcfce7")
COR_VERMELHA = HexColor("#dc2626")
COR_VERMELHA_CLARA = HexColor("#fee2e2")

METODOS = {
    "facial": "Reconhecimento facial",
    "webauthn": "Biometria do aparelho",
    "otp": "Código por e-mail",
    "manual": "Registro manual",
    "selfie": "Selfie",
}


def _fmt_dt(dt):
    if not dt:
        return "—"
    return timezone.localtime(dt).strftime("%d/%m/%Y %H:%M")


def _unidade(bloco, apartamento):
    bloco = (bloco or "").strip()
    apartamento = (apartamento or "").strip()
    if bloco and apartamento:
        return f"{bloco} / {apartamento}"
    return bloco or apartamento or "—"


def _metodo(valor):
    valor = (valor or "").strip()
    return METODOS.get(valor, valor.replace("_", " ").capitalize() or "—")


def _esc(texto):
    """Escapa o que vai dentro de Paragraph (o reportlab lê mini-HTML)."""
    return (
        str(texto or "")
        .replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
    )


def _estilos():
    st = getSampleStyleSheet()
    st.add(ParagraphStyle(
        "RelTitulo", parent=st["Title"], fontSize=19, leading=23,
        textColor=COR_TEXTO, alignment=TA_CENTER, spaceAfter=2,
    ))
    st.add(ParagraphStyle(
        "RelSub", parent=st["Normal"], fontSize=10, alignment=TA_CENTER,
        textColor=COR_SUAVE, spaceAfter=2,
    ))
    st.add(ParagraphStyle(
        "RelSecao", parent=st["Heading2"], fontSize=12.5, spaceBefore=14,
        spaceAfter=6, textColor=COR_PRIMARIA_ESCURA,
    ))
    st.add(ParagraphStyle(
        "RelCorpo", parent=st["Normal"], fontSize=9.5, leading=14,
        textColor=COR_TEXTO,
    ))
    st.add(ParagraphStyle(
        "RelNota", parent=st["Normal"], fontSize=8, leading=11,
        textColor=COR_SUAVE,
    ))
    st.add(ParagraphStyle(
        "RelCelula", parent=st["Normal"], fontSize=8.5, leading=11,
        textColor=COR_TEXTO,
    ))
    st.add(ParagraphStyle(
        "RelCabecalho", parent=st["Normal"], fontSize=8.5, leading=11,
        textColor=colors.white, fontName="Helvetica-Bold",
    ))
    st.add(ParagraphStyle(
        "KpiNumero", parent=st["Normal"], fontSize=17, leading=19,
        alignment=TA_CENTER, textColor=COR_PRIMARIA_ESCURA,
        fontName="Helvetica-Bold",
    ))
    st.add(ParagraphStyle(
        "KpiRotulo", parent=st["Normal"], fontSize=7.5, leading=9.5,
        alignment=TA_CENTER, textColor=COR_SUAVE,
    ))
    st.add(ParagraphStyle(
        "RelDireita", parent=st["Normal"], fontSize=9.5, leading=13,
        alignment=TA_RIGHT, textColor=COR_TEXTO,
    ))
    return st


def _moldura(condominio, etiqueta):
    """Faixa colorida no topo + rodapé com data e página, em toda folha."""

    gerado = _fmt_dt(timezone.now())

    def desenhar(canvas, doc):
        canvas.saveState()
        largura, altura = doc.pagesize

        canvas.setFillColor(COR_PRIMARIA)
        canvas.rect(0, altura - 1.65 * cm, largura, 1.65 * cm, stroke=0, fill=1)
        canvas.setFillColor(HexColor("#a5b4fc"))
        canvas.rect(0, altura - 1.75 * cm, largura, 0.1 * cm, stroke=0, fill=1)

        canvas.setFillColor(colors.white)
        canvas.setFont("Helvetica-Bold", 11)
        canvas.drawString(1.6 * cm, altura - 1.05 * cm, condominio[:60])
        canvas.setFont("Helvetica", 9)
        canvas.drawRightString(largura - 1.6 * cm, altura - 1.05 * cm, etiqueta)

        canvas.setStrokeColor(COR_LINHA)
        canvas.setLineWidth(0.5)
        canvas.line(1.6 * cm, 1.35 * cm, largura - 1.6 * cm, 1.35 * cm)
        canvas.setFillColor(COR_SUAVE)
        canvas.setFont("Helvetica", 7.5)
        canvas.drawString(
            1.6 * cm, 0.95 * cm,
            f"Documento gerado em {gerado} · appvotacao.com.br",
        )
        canvas.drawRightString(
            largura - 1.6 * cm, 0.95 * cm, f"Página {doc.page}"
        )
        canvas.restoreState()

    return desenhar


def _documento(assembleia, etiqueta, paisagem=False):
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(
        buffer,
        pagesize=landscape(A4) if paisagem else A4,
        leftMargin=1.6 * cm, rightMargin=1.6 * cm,
        topMargin=2.4 * cm, bottomMargin=1.8 * cm,
        title=f"{etiqueta} — {assembleia.titulo}",
        author="appvotacao.com.br",
    )
    return buffer, doc


def _capa(st, assembleia, titulo, descricao):
    el = [
        Paragraph(_esc(titulo), st["RelTitulo"]),
        Paragraph(_esc(assembleia.titulo), st["RelSub"]),
        Paragraph(
            f"{_esc(assembleia.condominio.nome)} · início {_fmt_dt(assembleia.data_inicio)}"
            + (f" · encerramento {_fmt_dt(assembleia.data_fim)}" if assembleia.data_fim else ""),
            st["RelNota"],
        ),
        Spacer(1, 10),
    ]
    if descricao:
        el.append(Paragraph(_esc(descricao), st["RelNota"]))
        el.append(Spacer(1, 6))
    return el


def _kpis(st, itens, largura_total):
    """Faixa de números-resumo, um quadrinho por item (valor + rótulo)."""
    celulas = [
        [
            Paragraph(str(valor), st["KpiNumero"]),
        ]
        for valor, _ in itens
    ]
    linha_valores = [c[0] for c in celulas]
    linha_rotulos = [Paragraph(_esc(rotulo), st["KpiRotulo"]) for _, rotulo in itens]
    largura = largura_total / len(itens)
    t = Table([linha_valores, linha_rotulos], colWidths=[largura] * len(itens))
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), COR_PRIMARIA_CLARA),
        ("BOX", (0, 0), (-1, -1), 0.5, COR_LINHA),
        ("INNERGRID", (0, 0), (-1, -1), 0.5, colors.white),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("TOPPADDING", (0, 0), (-1, 0), 8),
        ("BOTTOMPADDING", (0, 0), (-1, 0), 0),
        ("TOPPADDING", (0, 1), (-1, 1), 0),
        ("BOTTOMPADDING", (0, 1), (-1, 1), 8),
    ]))
    return t


def _estilo_tabela(zebra_de=1):
    return [
        ("BACKGROUND", (0, 0), (-1, 0), COR_PRIMARIA),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("GRID", (0, 0), (-1, -1), 0.4, COR_LINHA),
        ("LINEBELOW", (0, 0), (-1, 0), 0.6, COR_PRIMARIA_ESCURA),
        ("ROWBACKGROUNDS", (0, zebra_de), (-1, -1), [colors.white, COR_ZEBRA]),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
        ("LEFTPADDING", (0, 0), (-1, -1), 5),
        ("RIGHTPADDING", (0, 0), (-1, -1), 5),
    ]


def _cabecalho(st, textos):
    return [Paragraph(_esc(t), st["RelCabecalho"]) for t in textos]


def _assinatura(st, rotulos):
    el = [Spacer(1, 26)]
    linha = [Paragraph("_" * 42, st["RelCorpo"]) for _ in rotulos]
    nomes = [Paragraph(_esc(r), st["RelNota"]) for r in rotulos]
    t = Table([linha, nomes], colWidths=[8.2 * cm] * len(rotulos))
    t.setStyle(TableStyle([
        ("ALIGN", (0, 0), (-1, -1), "CENTER"),
        ("TOPPADDING", (0, 0), (-1, -1), 2),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 2),
    ]))
    el.append(t)
    return el


# ---------------------------------------------------------------- presença


def pdf_lista_presenca(assembleia):
    """Quem esteve presente: unidade, identificação e horário de entrada."""
    st = _estilos()
    buffer, doc = _documento(assembleia, "Lista de presença")
    largura = doc.width

    presencas = list(assembleia.presencas.all().order_by("horario_entrada"))
    base = assembleia.votantes.count() or assembleia.condominio.eleitores.count()
    presentes = len(presencas)
    inadimplentes = sum(1 for p in presencas if p.inadimplente)
    online = sum(1 for p in presencas if p.modo_participacao == "online")
    percentual = round(presentes / base * 100, 1) if base else 0

    el = _capa(
        st, assembleia, "Lista de presença",
        "Relação oficial dos participantes registrados nesta assembleia.",
    )
    el.append(_kpis(st, [
        (presentes, "Presentes"),
        (base or "—", "Unidades aptas"),
        (f"{percentual}%", "Quórum"),
        (online, "Online"),
        (inadimplentes, "Inadimplentes"),
    ], largura))
    el.append(Spacer(1, 14))

    if not presencas:
        el.append(Paragraph("Nenhuma presença registrada.", st["RelCorpo"]))
    else:
        linhas = [_cabecalho(st, [
            "#", "Nome", "Unidade", "Perfil", "Identificação", "Modo", "Entrada",
        ])]
        destaques = []
        for i, p in enumerate(presencas, start=1):
            if p.inadimplente:
                destaques.append(i)
            linhas.append([
                Paragraph(str(i), st["RelCelula"]),
                Paragraph(_esc(p.nome), st["RelCelula"]),
                Paragraph(_esc(_unidade(p.bloco, p.apartamento)), st["RelCelula"]),
                Paragraph(
                    "Procurador" if p.perfil == "procurador" else "Proprietário",
                    st["RelCelula"],
                ),
                Paragraph(_esc(_metodo(p.metodo_auth)), st["RelCelula"]),
                Paragraph(
                    "Online" if p.modo_participacao == "online" else "Presencial",
                    st["RelCelula"],
                ),
                Paragraph(_fmt_dt(p.horario_entrada), st["RelCelula"]),
            ])
        t = Table(
            linhas,
            colWidths=[0.9 * cm, 5.1 * cm, 2.5 * cm, 2.2 * cm, 3.1 * cm, 1.8 * cm, 2.2 * cm],
            repeatRows=1,
        )
        estilo = _estilo_tabela()
        for i in destaques:
            estilo.append(("BACKGROUND", (0, i), (-1, i), COR_VERMELHA_CLARA))
            estilo.append(("TEXTCOLOR", (1, i), (1, i), COR_VERMELHA))
        t.setStyle(TableStyle(estilo))
        el.append(t)
        if destaques:
            el.append(Spacer(1, 6))
            el.append(Paragraph(
                "As linhas em vermelho são unidades marcadas como inadimplentes.",
                st["RelNota"],
            ))

    el += _assinatura(st, ["Síndico(a)", "Secretário(a) da assembleia"])
    desenhar = _moldura(assembleia.condominio.nome, "Lista de presença")
    doc.build(el, onFirstPage=desenhar, onLaterPages=desenhar)
    buffer.seek(0)
    return buffer.read()


# ---------------------------------------------------------------- votação


def _identidade(voto):
    if voto.eleitor_id:
        return voto.eleitor.nome, voto.eleitor.bloco, voto.eleitor.apartamento
    if voto.votante_manual_id:
        return (
            voto.votante_manual.nome,
            voto.votante_manual.bloco,
            voto.votante_manual.apartamento,
        )
    return voto.decl_nome or "—", voto.decl_bloco, voto.decl_apartamento


def pdf_votacao(assembleia):
    """Auditoria voto a voto: quem votou, em quê, como e de onde."""
    st = _estilos()
    buffer, doc = _documento(assembleia, "Relatório de votação", paisagem=True)
    largura = doc.width

    votos = list(
        Voto.objects.filter(assembleia=assembleia)
        .select_related("eleitor", "votante_manual", "questao", "opcao_escolhida")
        .order_by("questao__ordem", "timestamp")
    )
    validados = sum(1 for v in votos if v.status == Voto.Status.VALIDADO)
    pendentes = sum(1 for v in votos if v.status == Voto.Status.PENDENTE)
    rejeitados = sum(1 for v in votos if v.status == Voto.Status.REJEITADO)

    el = _capa(
        st, assembleia, "Relatório de votação",
        "Registro de auditoria: cada voto com identificação, autenticação, "
        "endereço de IP, aparelho e código de verificação.",
    )
    el.append(_kpis(st, [
        (len(votos), "Votos registrados"),
        (validados, "Validados"),
        (pendentes, "Pendentes"),
        (rejeitados, "Invalidados"),
        (assembleia.questoes.count(), "Questões"),
    ], largura))
    el.append(Spacer(1, 14))

    if not votos:
        el.append(Paragraph("Nenhum voto registrado.", st["RelCorpo"]))
    else:
        # Agrupado por questão: o título aparece uma vez como subtítulo, em vez
        # de repetido em cada linha — cabe muito mais gente por folha.
        por_questao = {}
        for v in votos:
            por_questao.setdefault(v.questao_id, []).append(v)

        for questao in assembleia.questoes.order_by("ordem", "id"):
            do_item = por_questao.get(questao.id, [])
            if not do_item:
                continue
            validos_item = sum(1 for v in do_item if v.status == Voto.Status.VALIDADO)
            el.append(Paragraph(_esc(questao.titulo), st["RelSecao"]))
            el.append(Paragraph(
                f"{len(do_item)} registro(s) · {validos_item} válido(s)",
                st["RelNota"],
            ))
            el.append(Spacer(1, 5))

            linhas = [_cabecalho(st, [
                "#", "Nome", "Unidade", "Voto", "Autenticação",
                "IP", "Aparelho", "Data e hora", "Situação", "Código",
            ])]
            estilo = _estilo_tabela()
            for i, v in enumerate(do_item, start=1):
                nome, bloco, apto = _identidade(v)
                if v.status != Voto.Status.VALIDADO:
                    estilo.append((
                        "BACKGROUND", (0, i), (-1, i),
                        COR_VERMELHA_CLARA
                        if v.status == Voto.Status.REJEITADO
                        else HexColor("#fef3c7"),
                    ))
                linhas.append([
                    Paragraph(str(i), st["RelCelula"]),
                    Paragraph(_esc(nome), st["RelCelula"]),
                    Paragraph(_esc(_unidade(bloco, apto)), st["RelCelula"]),
                    Paragraph(
                        _esc(v.opcao_escolhida.texto if v.opcao_escolhida else "—"),
                        st["RelCelula"],
                    ),
                    Paragraph(_esc(_metodo(v.metodo_auth)), st["RelCelula"]),
                    Paragraph(_esc(v.ip_address or "—"), st["RelCelula"]),
                    Paragraph(_esc(v.device_info or v.marca_aparelho or "—"), st["RelCelula"]),
                    Paragraph(_fmt_dt(v.timestamp), st["RelCelula"]),
                    Paragraph(_esc(v.get_status_display()), st["RelCelula"]),
                    Paragraph(_esc((v.hash_voto or "")[:10]), st["RelCelula"]),
                ])
            t = Table(
                linhas,
                colWidths=[
                    0.8 * cm, 5.4 * cm, 2.4 * cm, 3.6 * cm, 2.8 * cm,
                    2.4 * cm, 3.0 * cm, 2.4 * cm, 1.9 * cm, 2.0 * cm,
                ],
                repeatRows=1,
            )
            t.setStyle(TableStyle(estilo))
            el.append(t)
            el.append(Spacer(1, 10))

        el.append(Paragraph(
            "Votos invalidados aparecem em vermelho e os pendentes de validação "
            "em amarelo; nenhum dos dois entra na apuração. O código é o início "
            "do hash do voto, conferível em appvotacao.com.br/verificar.",
            st["RelNota"],
        ))

    el += _assinatura(st, ["Síndico(a)", "Secretário(a) da assembleia"])
    desenhar = _moldura(assembleia.condominio.nome, "Relatório de votação")
    doc.build(el, onFirstPage=desenhar, onLaterPages=desenhar)
    buffer.seek(0)
    return buffer.read()


# --------------------------------------------------------------- resultado


def _barra(percentual, vencedora, largura_total=5.4 * cm):
    cheia = max(min(percentual, 100), 0) / 100 * largura_total
    vazia = max(largura_total - cheia, 0.001)
    cor = COR_VERDE if vencedora else COR_PRIMARIA
    if cheia <= 0:
        t = Table([[""]], colWidths=[largura_total], rowHeights=[0.3 * cm])
        estilo = [("BACKGROUND", (0, 0), (0, 0), COR_LINHA)]
    else:
        t = Table([["", ""]], colWidths=[cheia, vazia], rowHeights=[0.3 * cm])
        estilo = [
            ("BACKGROUND", (0, 0), (0, 0), cor),
            ("BACKGROUND", (1, 0), (1, 0), COR_LINHA),
        ]
    estilo += [
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
        ("RIGHTPADDING", (0, 0), (-1, -1), 0),
        ("TOPPADDING", (0, 0), (-1, -1), 0),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
    ]
    t.setStyle(TableStyle(estilo))
    return t


def pdf_resultado(assembleia):
    """A apuração: votos e percentual por opção, com a vencedora destacada."""
    st = _estilos()
    buffer, doc = _documento(assembleia, "Relatório do resultado")
    largura = doc.width

    presentes = assembleia.presencas.count()
    base = assembleia.votantes.count() or assembleia.condominio.eleitores.count()
    questoes = list(assembleia.questoes.prefetch_related("opcoes").order_by("ordem", "id"))
    total_geral = Voto.objects.filter(
        assembleia=assembleia, status=Voto.Status.VALIDADO
    ).count()

    el = _capa(
        st, assembleia, "Relatório do resultado",
        "Apuração oficial. Contam apenas os votos validados; votos pendentes "
        "ou invalidados ficam de fora.",
    )
    el.append(_kpis(st, [
        (len(questoes), "Questões"),
        (total_geral, "Votos válidos"),
        (presentes, "Presentes"),
        (base or "—", "Unidades aptas"),
    ], largura))
    el.append(Spacer(1, 8))

    if not questoes:
        el.append(Paragraph("Nenhuma questão cadastrada.", st["RelCorpo"]))

    for indice, questao in enumerate(questoes, start=1):
        votos_q = list(
            Voto.objects.filter(questao=questao, status=Voto.Status.VALIDADO)
            .values_list("opcao_escolhida_id", flat=True)
        )
        total_q = len(votos_q)
        contagem = {}
        for opcao_id in votos_q:
            contagem[str(opcao_id)] = contagem.get(str(opcao_id), 0) + 1

        opcoes = list(questao.opcoes.order_by("ordem", "id"))
        maior = max((contagem.get(str(o.id), 0) for o in opcoes), default=0)
        empate = sum(1 for o in opcoes if contagem.get(str(o.id), 0) == maior) > 1

        bloco = [
            Paragraph(f"{indice}. {_esc(questao.titulo)}", st["RelSecao"]),
        ]
        situacao = "Encerrada" if questao.encerrada else "Em aberto"
        bloco.append(Paragraph(
            f"{situacao} · {total_q} voto(s) válido(s)"
            + (f" · {max(presentes - total_q, 0)} abstenção(ões)" if presentes else ""),
            st["RelNota"],
        ))
        bloco.append(Spacer(1, 5))

        linhas = [_cabecalho(st, ["Opção", "Votos", "%", "Participação"])]
        estilo = _estilo_tabela()
        for i, opcao in enumerate(opcoes, start=1):
            votos_op = contagem.get(str(opcao.id), 0)
            pct = round(votos_op / total_q * 100, 1) if total_q else 0
            vencedora = total_q > 0 and votos_op == maior and not empate
            rotulo = _esc(opcao.texto)
            if vencedora:
                rotulo = f"<b>{rotulo}</b> — vencedora"
                estilo.append(("BACKGROUND", (0, i), (-1, i), COR_VERDE_CLARA))
                estilo.append(("TEXTCOLOR", (0, i), (0, i), HexColor("#166534")))
            linhas.append([
                Paragraph(rotulo, st["RelCelula"]),
                Paragraph(str(votos_op), st["RelCelula"]),
                Paragraph(f"{pct}%", st["RelCelula"]),
                _barra(pct, vencedora),
            ])
        t = Table(
            linhas,
            colWidths=[7.4 * cm, 1.6 * cm, 1.6 * cm, 6.2 * cm],
            repeatRows=1,
        )
        t.setStyle(TableStyle(estilo))
        bloco.append(t)
        if total_q and empate:
            bloco.append(Spacer(1, 4))
            bloco.append(Paragraph(
                "Houve empate entre as opções mais votadas — nenhuma foi "
                "marcada como vencedora.",
                st["RelNota"],
            ))
        bloco.append(Spacer(1, 10))
        el.append(KeepTogether(bloco))

    el += _assinatura(st, ["Síndico(a)", "Secretário(a) da assembleia"])
    desenhar = _moldura(assembleia.condominio.nome, "Relatório do resultado")
    doc.build(el, onFirstPage=desenhar, onLaterPages=desenhar)
    buffer.seek(0)
    return buffer.read()

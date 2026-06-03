"""Gera o PDF oficial da ata da assembleia (reportlab).

Inclui cabeçalho do condomínio, dados da assembleia, lista de presença,
resultados das votações e o texto da ata. Documento arquivável.
"""

import io

from django.db.models import Count, Q
from django.utils import timezone
from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_JUSTIFY
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import cm
from reportlab.platypus import (
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)


def _fmt_dt(dt):
    if not dt:
        return "—"
    return timezone.localtime(dt).strftime("%d/%m/%Y %H:%M")


def _styles():
    base = getSampleStyleSheet()
    base.add(ParagraphStyle(
        "TituloDoc", parent=base["Title"], fontSize=16, alignment=TA_CENTER,
        spaceAfter=4,
    ))
    base.add(ParagraphStyle(
        "Sub", parent=base["Normal"], fontSize=9, alignment=TA_CENTER,
        textColor=colors.grey, spaceAfter=12,
    ))
    base.add(ParagraphStyle(
        "Secao", parent=base["Heading2"], fontSize=12, spaceBefore=14,
        spaceAfter=6, textColor=colors.HexColor("#1e293b"),
    ))
    base.add(ParagraphStyle(
        "Corpo", parent=base["Normal"], fontSize=10, alignment=TA_JUSTIFY,
        leading=15,
    ))
    return base


def _resultados(assembleia):
    blocos = []
    for questao in assembleia.questoes.prefetch_related("opcoes").all():
        linhas = [["Opção", "Votos"]]
        total = 0
        opcoes = questao.opcoes.annotate(
            n=Count(
                "votos",
                filter=Q(votos__questao=questao)
                & Q(votos__status="validado"),
            )
        )
        for opcao in opcoes:
            total += opcao.n
            linhas.append([opcao.texto, str(opcao.n)])
        for i in range(1, len(linhas)):
            pct = round(int(linhas[i][1]) / total * 100, 1) if total else 0
            linhas[i][1] = f"{linhas[i][1]} ({pct}%)"
        blocos.append((questao.titulo, total, linhas))
    return blocos


def gerar_pdf(assembleia):
    """Retorna os bytes do PDF oficial da ata."""
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(
        buffer, pagesize=A4,
        leftMargin=2 * cm, rightMargin=2 * cm,
        topMargin=1.6 * cm, bottomMargin=1.6 * cm,
        title=f"Ata — {assembleia.titulo}",
    )
    st = _styles()
    el = []

    el.append(Paragraph(assembleia.condominio.nome, st["TituloDoc"]))
    el.append(Paragraph("ATA DE ASSEMBLEIA", st["Sub"]))

    el.append(Paragraph(assembleia.titulo, st["Secao"]))
    info = [
        ["Início", _fmt_dt(assembleia.data_inicio)],
        ["Encerramento", _fmt_dt(assembleia.data_fim)],
        ["Presentes", str(assembleia.presencas.count())],
        ["Documento gerado em", _fmt_dt(timezone.now())],
    ]
    t = Table(info, colWidths=[5 * cm, 11 * cm])
    t.setStyle(TableStyle([
        ("FONTSIZE", (0, 0), (-1, -1), 9),
        ("TEXTCOLOR", (0, 0), (0, -1), colors.grey),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
    ]))
    el.append(t)

    # Lista de presença
    el.append(Paragraph("Lista de presença", st["Secao"]))
    presencas = assembleia.presencas.all().order_by("horario_entrada")
    if presencas:
        linhas = [["Nome", "Unidade", "Entrada"]]
        for p in presencas:
            unidade = f"{p.bloco} / {p.apartamento}" if p.bloco else p.apartamento
            linhas.append([p.nome, unidade, _fmt_dt(p.horario_entrada)])
        tp = Table(linhas, colWidths=[8 * cm, 4 * cm, 4 * cm], repeatRows=1)
        tp.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#f1f5f9")),
            ("FONTSIZE", (0, 0), (-1, -1), 8),
            ("GRID", (0, 0), (-1, -1), 0.25, colors.HexColor("#e2e8f0")),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
            ("TOPPADDING", (0, 0), (-1, -1), 3),
        ]))
        el.append(tp)
    else:
        el.append(Paragraph("Nenhum presente registrado.", st["Corpo"]))

    # Resultados das votações
    blocos = _resultados(assembleia)
    if blocos:
        el.append(Paragraph("Resultados das votações", st["Secao"]))
        for titulo, total, linhas in blocos:
            el.append(Paragraph(f"<b>{titulo}</b> — {total} voto(s)", st["Corpo"]))
            tr = Table(linhas, colWidths=[12 * cm, 4 * cm], repeatRows=1)
            tr.setStyle(TableStyle([
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#f1f5f9")),
                ("FONTSIZE", (0, 0), (-1, -1), 9),
                ("GRID", (0, 0), (-1, -1), 0.25, colors.HexColor("#e2e8f0")),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
                ("TOPPADDING", (0, 0), (-1, -1), 3),
            ]))
            el.append(tr)
            el.append(Spacer(1, 6))

    # Texto da ata
    ata = getattr(assembleia, "ata", None)
    if ata and ata.ata_texto.strip():
        el.append(Paragraph("Ata", st["Secao"]))
        for paragrafo in ata.ata_texto.strip().split("\n"):
            texto = paragrafo.strip()
            if texto:
                el.append(Paragraph(texto.replace("&", "&amp;"), st["Corpo"]))
                el.append(Spacer(1, 4))

    el.append(Spacer(1, 30))
    el.append(Paragraph(
        "_______________________________________________", st["Corpo"]))
    el.append(Paragraph("Síndico(a) / Secretário(a) da assembleia", st["Corpo"]))

    doc.build(el)
    buffer.seek(0)
    return buffer.read()

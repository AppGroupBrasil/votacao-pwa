"""Comprovante de presença da lista (PDF), entregue ao morador que registrou.

Traz tudo o que ficou gravado no registro: foto, nome, CPF mascarado, unidade,
observação, assinatura desenhada, localização, aparelho e endereço de rede.
Usa a mesma moldura e paleta dos relatórios da assembleia.
"""

import base64
import binascii
import io

from django.core import signing
from django.utils import timezone
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import cm
from reportlab.lib.utils import ImageReader
from reportlab.platypus import Image, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

from apps.assembleias.relatorios_pdf import (
    COR_LINHA,
    COR_PRIMARIA_CLARA,
    COR_SUAVE,
    COR_ZEBRA,
    _esc,
    _estilos,
    _moldura,
)

SALT_COMPROVANTE = "comprovante-presenca"

PERFIS = {
    "proprietario": "Proprietário(a)",
    "locatario": "Locatário(a)",
    "conjuge": "Cônjuge",
    "procurador": "Procurador(a)",
    "outro": "Outro",
}

METODOS = {
    "selfie": "Foto e assinatura",
    "facial": "Reconhecimento facial",
    "cpf": "CPF",
    "cpf_facial": "CPF e reconhecimento facial",
    "webauthn": "Digital do aparelho",
    "otp": "Código por e-mail",
}

LARGURA_UTIL = A4[0] - 3.2 * cm
LARGURA_FOTO = 5.4 * cm


def token_comprovante(registro):
    """O link do comprovante é a guarda: assinado pelo servidor e entregue só
    ao aparelho que fez o registro."""
    return signing.dumps(str(registro.id), salt=SALT_COMPROVANTE)


def registro_do_token(token):
    """Id do registro dentro do link, ou None se o link foi alterado."""
    try:
        return signing.loads(token, salt=SALT_COMPROVANTE)
    except signing.BadSignature:
        return None


def numero_registro(registro):
    return str(registro.id)[:8].upper()


def dados_comprovante(registro):
    """O que a tela do morador mostra no comprovante, além do que ele mesmo
    digitou: o que só o servidor sabe (hora gravada, IP, número)."""
    return {
        "token": token_comprovante(registro),
        "numero": numero_registro(registro),
        "registrado_em": registro.criado_em.isoformat(),
        "ip": registro.ip_address or "",
        "aparelho": registro.marca_aparelho,
        "sistema": registro.device_info,
        "device_id": registro.device_id,
        "cpf_mascarado": registro.cpf_mascarado,
    }


def _imagem(data_url, largura_max, altura_max):
    """Foto ou assinatura guardada em data URL. Imagem que não abre vira None
    e o comprovante sai assim mesmo, com o aviso no lugar."""
    if not data_url or not data_url.startswith("data:image/") or "," not in data_url:
        return None
    try:
        bruto = base64.b64decode(data_url.split(",", 1)[1])
        largura, altura = ImageReader(io.BytesIO(bruto)).getSize()
    except (binascii.Error, OSError, ValueError):
        return None
    if not largura or not altura:
        return None
    escala = min(largura_max / largura, altura_max / altura)
    return Image(io.BytesIO(bruto), width=largura * escala, height=altura * escala)


def _quando(dt):
    return timezone.localtime(dt).strftime("%d/%m/%Y às %H:%M:%S")


def _tabela(st, linhas, largura_rotulo, largura_total):
    t = Table(
        [
            [Paragraph(_esc(rotulo), st["CompRotulo"]), valor]
            for rotulo, valor in linhas
        ],
        colWidths=[largura_rotulo, largura_total - largura_rotulo],
    )
    t.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("ROWBACKGROUNDS", (0, 0), (-1, -1), [colors.white, COR_ZEBRA]),
        ("LINEBELOW", (0, 0), (-1, -1), 0.4, COR_LINHA),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
        ("LEFTPADDING", (0, 0), (-1, -1), 5),
    ]))
    return t


def pdf_comprovante_presenca(registro):
    lista = registro.lista
    condominio = lista.condominio.nome if lista.condominio_id else lista.titulo
    st = _estilos()
    st.add(ParagraphStyle(
        "CompRotulo", parent=st["RelCorpo"], textColor=COR_SUAVE, fontSize=8.5,
    ))
    st.add(ParagraphStyle(
        "CompValor", parent=st["RelCorpo"], fontName="Helvetica-Bold", fontSize=10.5,
    ))

    def valor(texto, estilo="RelCorpo"):
        return Paragraph(_esc(texto) or "—", st[estilo])

    buffer = io.BytesIO()
    doc = SimpleDocTemplate(
        buffer,
        pagesize=A4,
        leftMargin=1.6 * cm, rightMargin=1.6 * cm,
        topMargin=2.4 * cm, bottomMargin=1.8 * cm,
        title=f"Comprovante de presença — {registro.nome}",
        author="appvotacao.com.br",
    )

    el = [
        Paragraph("Comprovante de presença", st["RelTitulo"]),
        Paragraph(_esc(lista.titulo), st["RelSub"]),
    ]
    if lista.descricao:
        el.append(Paragraph(_esc(lista.descricao).replace("\n", "<br/>"), st["RelSub"]))
    el.append(Spacer(1, 12))

    unidade = " · ".join(
        p for p in (
            f"Bloco {registro.bloco}" if registro.bloco else "",
            f"Apto {registro.apartamento}" if registro.apartamento else "",
        ) if p
    )
    dados = _tabela(st, [
        ("Nome", valor(registro.nome, "CompValor")),
        ("CPF", valor(registro.cpf_mascarado or "Não informado")),
        ("Unidade", valor(unidade)),
        ("Perfil", valor(PERFIS.get(registro.perfil, registro.perfil))),
        ("Data e hora", valor(f"{_quando(registro.criado_em)} (horário de Brasília)")),
        ("Nº do registro", valor(numero_registro(registro), "CompValor")),
    ], 2.9 * cm, LARGURA_UTIL - LARGURA_FOTO)

    foto = _imagem(registro.selfie, LARGURA_FOTO - 0.4 * cm, 7 * cm) or valor(
        "Foto indisponível"
    )
    topo = Table([[foto, dados]], colWidths=[LARGURA_FOTO, LARGURA_UTIL - LARGURA_FOTO])
    topo.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("ALIGN", (0, 0), (0, 0), "CENTER"),
        ("LEFTPADDING", (0, 0), (0, 0), 0),
    ]))
    el.append(topo)

    if registro.observacao:
        el.append(Paragraph("Observações", st["RelSecao"]))
        caixa = Table(
            [[Paragraph(_esc(registro.observacao).replace("\n", "<br/>"), st["RelCorpo"])]],
            colWidths=[LARGURA_UTIL],
        )
        caixa.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, -1), COR_PRIMARIA_CLARA),
            ("BOX", (0, 0), (-1, -1), 0.5, COR_LINHA),
            ("TOPPADDING", (0, 0), (-1, -1), 6),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
        ]))
        el.append(caixa)

    el.append(Paragraph("Assinatura", st["RelSecao"]))
    assinatura = _imagem(registro.assinatura, 9 * cm, 3 * cm) or valor(
        "Assinatura indisponível"
    )
    quadro = Table([[assinatura]], colWidths=[9.6 * cm], hAlign="LEFT")
    quadro.setStyle(TableStyle([
        ("BOX", (0, 0), (-1, -1), 0.6, COR_LINHA),
        ("ALIGN", (0, 0), (-1, -1), "CENTER"),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
    ]))
    el.append(quadro)

    if registro.geo_lat is not None and registro.geo_lng is not None:
        coordenadas = f"{registro.geo_lat:.6f}, {registro.geo_lng:.6f}"
        mapa = f"https://www.google.com/maps?q={registro.geo_lat},{registro.geo_lng}"
        localizacao = Paragraph(
            f'{coordenadas} · <a href="{mapa}" color="#4f46e5">ver no mapa</a>',
            st["RelCorpo"],
        )
    else:
        localizacao = valor("Não autorizada no aparelho")
    consentimento = (
        f"Sim, em {_quando(registro.consentimento_em)}"
        if registro.consentimento_lgpd and registro.consentimento_em
        else ("Sim" if registro.consentimento_lgpd else "Não")
    )
    el.append(Paragraph("Dados do registro", st["RelSecao"]))
    el.append(_tabela(st, [
        ("Localização", localizacao),
        ("Aparelho", valor(registro.marca_aparelho)),
        ("Sistema e navegador", valor(registro.device_info)),
        ("Identificação do aparelho", valor(registro.device_id)),
        ("Endereço de rede (IP)", valor(registro.ip_address)),
        ("Forma de identificação", valor(METODOS.get(registro.metodo_auth, registro.metodo_auth))),
        ("Autorização LGPD", valor(consentimento)),
        ("Declaração de veracidade", valor("Sim" if registro.declaracao_veracidade else "Não")),
    ], 4.4 * cm, LARGURA_UTIL))

    el.append(Spacer(1, 12))
    el.append(Paragraph(
        "Este comprovante reproduz o registro gravado no momento da presença. O CPF "
        "aparece com o começo e o fim escondidos, como fica guardado. A conferência "
        "final dos presentes é feita pela mesa da assembleia.",
        st["RelNota"],
    ))

    moldura = _moldura(condominio, "Comprovante de presença")
    doc.build(el, onFirstPage=moldura, onLaterPages=moldura)
    return buffer.getvalue()

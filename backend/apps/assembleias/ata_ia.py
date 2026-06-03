"""Geração de resumo e ata da assembleia a partir da transcrição.

Usa DeepSeek (padrão) ou OpenAI Mini via HTTP (urllib, sem dependências
externas). Se a chave correspondente não estiver configurada, levanta
AtaIAError com mensagem clara para a UI.

A transcrição em si (gravação -> texto) é feita fora daqui: por enquanto o
síndico cola o texto (ex.: legenda do YouTube ou saída do VoxIA). O ponto de
extensão para transcrição automática por IA é `transcrever_link`.
"""

import json
import mimetypes
import os
import urllib.error
import urllib.request
import uuid

from django.conf import settings

_TIMEOUT = 120
_TIMEOUT_AUDIO = 300
# Limite de tamanho do áudio baixado (Groq Whisper aceita até ~25-40 MB).
_MAX_AUDIO_BYTES = 40 * 1024 * 1024
_EXT_AUDIO = (".mp3", ".m4a", ".wav", ".ogg", ".webm", ".mp4", ".mpeg", ".mpga", ".flac")


class AtaIAError(Exception):
    """Falha na geração da ata (chave ausente, erro do provedor, etc.)."""


_PROMPT_SISTEMA = (
    "Você é um secretário de assembleia de condomínio no Brasil. A partir da "
    "transcrição bruta de uma reunião, redija uma ATA formal e fiel, em "
    "português do Brasil, sem inventar fatos. Use linguagem objetiva e "
    "impessoal. Estruture com: cabeçalho (condomínio, título, data se houver), "
    "ordem do dia, deliberações e decisões tomadas, votações com seus "
    "resultados quando mencionados, e encerramento. Não inclua comentários "
    "fora da ata."
)


def _build_messages(transcricao, titulo, condominio_nome):
    contexto = f"Título da assembleia: {titulo}\n"
    if condominio_nome:
        contexto += f"Condomínio: {condominio_nome}\n"
    user = (
        f"{contexto}\nTranscrição da gravação:\n\"\"\"\n{transcricao}\n\"\"\"\n\n"
        "Responda em JSON com as chaves \"resumo\" (3 a 6 linhas resumindo os "
        "pontos principais) e \"ata\" (a ata formal completa em texto)."
    )
    return [
        {"role": "system", "content": _PROMPT_SISTEMA},
        {"role": "user", "content": user},
    ]


def _post_json(url, payload, api_key):
    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=data,
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {api_key}",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=_TIMEOUT) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        detalhe = exc.read().decode("utf-8", "ignore")[:300]
        raise AtaIAError(f"Provedor de IA retornou erro {exc.code}: {detalhe}")
    except urllib.error.URLError as exc:
        raise AtaIAError(f"Não foi possível contatar o provedor de IA: {exc.reason}")


def _parse_resposta(conteudo):
    """Extrai (resumo, ata) da resposta do modelo (JSON, com fallback texto)."""
    try:
        obj = json.loads(conteudo)
        return obj.get("resumo", "").strip(), obj.get("ata", "").strip()
    except (json.JSONDecodeError, AttributeError):
        # Modelo não respondeu JSON puro: usa tudo como ata.
        return "", conteudo.strip()


def gerar_ata(transcricao, titulo="", condominio_nome="", provedor="deepseek"):
    """Gera (resumo, ata_texto) a partir da transcrição. Levanta AtaIAError."""
    transcricao = (transcricao or "").strip()
    if not transcricao:
        raise AtaIAError("Não há transcrição para gerar a ata.")

    messages = _build_messages(transcricao, titulo, condominio_nome)

    if provedor == "openai":
        api_key = settings.OPENAI_API_KEY
        if not api_key:
            raise AtaIAError(
                "Chave da OpenAI não configurada (OPENAI_API_KEY)."
            )
        url = "https://api.openai.com/v1/chat/completions"
        model = settings.OPENAI_MODEL
    else:
        api_key = settings.DEEPSEEK_API_KEY
        if not api_key:
            raise AtaIAError(
                "Chave do DeepSeek não configurada (DEEPSEEK_API_KEY)."
            )
        url = "https://api.deepseek.com/chat/completions"
        model = settings.DEEPSEEK_MODEL

    payload = {
        "model": model,
        "messages": messages,
        "temperature": 0.2,
        "response_format": {"type": "json_object"},
    }
    resposta = _post_json(url, payload, api_key)
    try:
        conteudo = resposta["choices"][0]["message"]["content"]
    except (KeyError, IndexError, TypeError):
        raise AtaIAError("Resposta inesperada do provedor de IA.")
    return _parse_resposta(conteudo)


def _baixar_audio(link):
    """Baixa o conteúdo de um link direto de áudio/vídeo. Levanta AtaIAError."""
    req = urllib.request.Request(link, headers={"User-Agent": "Mozilla/5.0"})
    try:
        with urllib.request.urlopen(req, timeout=_TIMEOUT_AUDIO) as resp:
            tamanho = resp.headers.get("Content-Length")
            if tamanho and int(tamanho) > _MAX_AUDIO_BYTES:
                raise AtaIAError(
                    "O arquivo é maior que 40 MB. Envie um trecho menor ou "
                    "cole a transcrição manualmente."
                )
            dados = resp.read(_MAX_AUDIO_BYTES + 1)
    except urllib.error.HTTPError as exc:
        raise AtaIAError(f"Não foi possível baixar o áudio (erro {exc.code}).")
    except urllib.error.URLError as exc:
        raise AtaIAError(f"Não foi possível baixar o áudio: {exc.reason}")
    if len(dados) > _MAX_AUDIO_BYTES:
        raise AtaIAError(
            "O arquivo é maior que 40 MB. Envie um trecho menor ou cole a "
            "transcrição manualmente."
        )
    return dados


def _multipart(campos, arquivo_nome, arquivo_bytes, arquivo_campo="file"):
    """Monta um corpo multipart/form-data. Retorna (content_type, body)."""
    boundary = f"----votacao{uuid.uuid4().hex}"
    crlf = b"\r\n"
    partes = []
    for nome, valor in campos.items():
        partes.append(b"--" + boundary.encode())
        partes.append(
            f'Content-Disposition: form-data; name="{nome}"'.encode()
        )
        partes.append(b"")
        partes.append(str(valor).encode())
    ctype = mimetypes.guess_type(arquivo_nome)[0] or "application/octet-stream"
    partes.append(b"--" + boundary.encode())
    partes.append(
        f'Content-Disposition: form-data; name="{arquivo_campo}"; '
        f'filename="{arquivo_nome}"'.encode()
    )
    partes.append(f"Content-Type: {ctype}".encode())
    partes.append(b"")
    partes.append(arquivo_bytes)
    partes.append(b"--" + boundary.encode() + b"--")
    partes.append(b"")
    body = crlf.join(partes)
    return f"multipart/form-data; boundary={boundary}", body


def transcrever_link(link):
    """Transcreve um link DIRETO de áudio/vídeo via Groq Whisper.

    Aceita URLs que apontam direto para um arquivo de mídia (mp3, m4a, mp4,
    wav, etc.). Links de página (YouTube, Drive) precisam de extração de áudio,
    que não é suportada aqui — nesse caso oriente colar a transcrição.
    Levanta AtaIAError com mensagem clara para a UI.
    """
    link = (link or "").strip()
    if not link:
        raise AtaIAError("Informe o link da gravação.")

    api_key = settings.GROQ_API_KEY
    if not api_key:
        raise AtaIAError(
            "Transcrição automática não configurada (GROQ_API_KEY). Cole a "
            "transcrição da gravação no campo abaixo."
        )

    caminho = urllib.request.urlparse(link).path.lower()
    if not caminho.endswith(_EXT_AUDIO):
        raise AtaIAError(
            "Transcrição automática só funciona com link direto de áudio/vídeo "
            "(mp3, m4a, mp4, wav...). Para YouTube ou Drive, baixe o áudio e "
            "envie o arquivo, ou cole a transcrição no campo abaixo."
        )

    dados = _baixar_audio(link)
    nome = os.path.basename(caminho) or "audio.mp3"
    ctype, body = _multipart(
        {"model": settings.GROQ_WHISPER_MODEL, "response_format": "text"},
        nome, dados,
    )
    req = urllib.request.Request(
        "https://api.groq.com/openai/v1/audio/transcriptions",
        data=body,
        headers={"Content-Type": ctype, "Authorization": f"Bearer {api_key}"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=_TIMEOUT_AUDIO) as resp:
            texto = resp.read().decode("utf-8", "ignore").strip()
    except urllib.error.HTTPError as exc:
        detalhe = exc.read().decode("utf-8", "ignore")[:300]
        raise AtaIAError(f"Falha na transcrição (erro {exc.code}): {detalhe}")
    except urllib.error.URLError as exc:
        raise AtaIAError(f"Não foi possível contatar o serviço de transcrição: {exc.reason}")
    if not texto:
        raise AtaIAError("A transcrição retornou vazia.")
    return texto

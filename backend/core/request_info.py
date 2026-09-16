"""Helpers para extrair IP e aparelho/navegador do request."""


def get_client_ip(request):
    """IP de quem fez o pedido.

    Atrás da Cloudflare + Traefik, o primeiro item do X-Forwarded-For é o IP da
    Cloudflare, não o do morador — era esse que ia para votos, presenças e
    comprovantes. O IP do morador vem no CF-Connecting-IP, que o
    RealClientIpMiddleware já copiou para o REMOTE_ADDR (sem a Cloudflare, ele
    usa o X-Forwarded-For)."""
    return (
        request.META.get("HTTP_CF_CONNECTING_IP", "").strip()
        or request.META.get("REMOTE_ADDR")
    )


def get_client_user_agent(request):
    return str(request.META.get("HTTP_USER_AGENT", "")).strip()


def infer_device_info(user_agent):
    if not user_agent:
        return "Não informado"

    ua = user_agent.lower()

    if "iphone" in ua:
        platform = "iPhone"
    elif "ipad" in ua:
        platform = "iPad"
    elif "android" in ua:
        platform = "Android"
    elif "windows" in ua:
        platform = "Windows"
    elif "mac os x" in ua or "macintosh" in ua:
        platform = "macOS"
    elif "linux" in ua:
        platform = "Linux"
    else:
        platform = "Dispositivo desconhecido"

    if "edg/" in ua:
        browser = "Edge"
    elif "chrome/" in ua and "edg/" not in ua:
        browser = "Chrome"
    elif "firefox/" in ua:
        browser = "Firefox"
    elif "safari/" in ua and "chrome/" not in ua:
        browser = "Safari"
    else:
        browser = "Navegador desconhecido"

    return f"{platform} / {browser}"


def presenca_request_defaults(request):
    """Defaults de IP/aparelho para criar uma Presenca a partir do request."""
    ua = get_client_user_agent(request)
    return {
        "ip_address": get_client_ip(request),
        "user_agent": ua,
        "device_info": infer_device_info(ua),
    }

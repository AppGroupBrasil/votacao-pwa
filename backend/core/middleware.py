"""
Atrás de Cloudflare + Traefik, o REMOTE_ADDR visto pelo Django é o IP do
proxy — todos os clientes caem no MESMO balde do django-ratelimit (key="ip"),
o que travaria a votação numa assembleia com muitos moradores simultâneos.
Este middleware restaura o IP real do cliente para que os limites por IP
valham por pessoa, não pelo proxy.
"""


class RealClientIpMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        ip = (
            request.META.get("HTTP_CF_CONNECTING_IP", "").strip()
            or (request.META.get("HTTP_X_FORWARDED_FOR") or "")
            .split(",")[0]
            .strip()
        )
        if ip:
            request.META["REMOTE_ADDR"] = ip
        return self.get_response(request)

"""Trilha de auditoria — registra eventos sensíveis da assembleia."""

from core.request_info import get_client_ip
from .models import LogAuditoria


def _ator(request):
    user = getattr(request, "user", None)
    if user and getattr(user, "is_authenticated", False):
        return user.get_username() or str(user)
    return "—"


def registrar_log(request, assembleia, acao, descricao=""):
    """Cria um registro de auditoria. Nunca interrompe o fluxo principal."""
    try:
        LogAuditoria.objects.create(
            assembleia=assembleia,
            condominio=getattr(assembleia, "condominio", None),
            acao=acao,
            descricao=descricao[:500],
            ator=_ator(request),
            ip_address=get_client_ip(request),
        )
    except Exception:
        pass

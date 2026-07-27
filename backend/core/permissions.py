from rest_framework.permissions import BasePermission


def get_user_condominios(user):
    """Return the set of condominio IDs the user can access, or None for master (all)."""
    if user.is_superuser:
        return None  # master sees everything

    perfil = getattr(user, "perfil_admin", None)
    if not perfil:
        return set()

    return set(perfil.condominios.values_list("id", flat=True))


def get_or_create_user_condominio(user):
    """Return the síndico's first condomínio, criando um padrão e vinculando ao
    perfil quando ele ainda não tem nenhum (caso do usuário que se cadastrou
    sozinho e vai direto criar uma lista de presença/enquete).

    Master (superuser) devolve None — ele não precisa de escopo."""
    if user.is_superuser:
        return None
    perfil = getattr(user, "perfil_admin", None)
    if perfil is None:
        return None

    condominio = perfil.condominios.first()
    if condominio is not None:
        return condominio

    from apps.condominios.models import Condominio

    condominio, _ = Condominio.objects.get_or_create(
        cnpj=f"AUTO-{user.id}"[:18],
        defaults={"nome": "Meu condomínio", "total_unidades": 0},
    )
    perfil.condominios.add(condominio)
    return condominio


def resolver_condominio_por_nome(user, nome_cond):
    """A partir do nome informado pelo síndico, devolve o condomínio ao qual a
    lista/votação pertence, sem nunca renomear o condomínio errado de quem
    administra vários. Master reusa/cria pelo nome; síndico com 1 condomínio
    nomeia o dele; síndico com vários cria um novo e vincula ao próprio perfil."""
    import uuid

    from rest_framework.exceptions import PermissionDenied

    from apps.condominios.models import Condominio

    nome_cond = (nome_cond or "").strip()
    escopo = get_user_condominios(user)
    if escopo is None:
        cond = Condominio.objects.filter(nome__iexact=nome_cond).first()
        return cond or Condominio.objects.create(
            nome=nome_cond,
            cnpj=f"MSTR-{uuid.uuid4().hex[:12]}",
            total_unidades=0,
        )

    perfil = getattr(user, "perfil_admin", None)
    if perfil is None:
        raise PermissionDenied("Nenhum condomínio associado ao seu usuário.")

    cond = perfil.condominios.filter(nome__iexact=nome_cond).first()
    if cond is not None:
        return cond

    conds = list(perfil.condominios.all()[:2])
    if len(conds) <= 1:
        cond = get_or_create_user_condominio(user)
        if cond is None:
            raise PermissionDenied("Nenhum condomínio associado ao seu usuário.")
        if nome_cond and cond.nome != nome_cond:
            cond.nome = nome_cond
            cond.save(update_fields=["nome", "atualizado_em"])
        return cond

    cond = Condominio.objects.create(
        nome=nome_cond,
        cnpj=f"C-{uuid.uuid4().hex[:14]}",
        total_unidades=0,
    )
    perfil.condominios.add(cond)
    return cond


class IsAdminWithRole(BasePermission):
    """
    Allow access to staff users who have a PerfilAdmin.
    Master (superuser) always passes.
    """

    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False
        if request.user.is_superuser:
            return True
        if not request.user.is_staff:
            return False
        return hasattr(request.user, "perfil_admin")


class IsMaster(BasePermission):
    """Apenas o master (superuser). Usado onde os dados não têm escopo de
    condomínio confiável (ex.: pedidos de exclusão LGPD com condomínio em texto
    livre), evitando expor CPF/e-mail de um condomínio a síndicos de outro."""

    def has_permission(self, request, view):
        return bool(
            request.user
            and request.user.is_authenticated
            and request.user.is_superuser
        )

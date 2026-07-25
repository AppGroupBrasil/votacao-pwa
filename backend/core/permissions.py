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

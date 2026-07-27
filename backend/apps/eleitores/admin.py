from django.contrib import admin

from .models import Eleitor, SolicitacaoExclusao


@admin.register(Eleitor)
class EleitorAdmin(admin.ModelAdmin):
    list_display = ["nome", "apartamento", "condominio", "cadastro_completo", "criado_em"]
    list_filter = ["cadastro_completo", "condominio"]
    search_fields = ["nome", "apartamento", "email"]


@admin.register(SolicitacaoExclusao)
class SolicitacaoExclusaoAdmin(admin.ModelAdmin):
    list_display = ["nome", "cpf", "email", "condominio", "status", "criado_em"]
    list_filter = ["status", "criado_em"]
    search_fields = ["nome", "cpf", "email", "condominio"]
    readonly_fields = ["criado_em", "ip_address", "user_agent"]

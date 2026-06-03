from django.urls import path

from .views import (
    procuracoes_pendentes,
    registrar_presenca,
    registrar_voto,
    relatorio_detalhado,
    resultados,
    unidades_assembleia,
    validar_procuracao,
    verificar_voto,
)

urlpatterns = [
    path("<uuid:assembleia_id>/votar/", registrar_voto, name="registrar-voto"),
    path("<uuid:assembleia_id>/presenca/", registrar_presenca, name="registrar-presenca"),
    path("<uuid:assembleia_id>/unidades/", unidades_assembleia, name="unidades-assembleia"),
    path("<uuid:assembleia_id>/procuracoes/", procuracoes_pendentes, name="procuracoes-pendentes"),
    path("<uuid:assembleia_id>/procuracoes/validar/", validar_procuracao, name="validar-procuracao"),
    path("<uuid:assembleia_id>/resultados/", resultados, name="resultados"),
    path("<uuid:assembleia_id>/relatorio/", relatorio_detalhado, name="relatorio-detalhado"),
    path("verificar/", verificar_voto, name="verificar-voto"),
]

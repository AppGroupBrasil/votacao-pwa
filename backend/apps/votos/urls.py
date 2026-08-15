from django.urls import path

from .views import (
    acesso_facial,
    acesso_manual,
    consultar_cpf_votacao,
    procuracoes_pendentes,
    presencas_captura,
    questoes_votadas,
    registrar_presenca,
    registrar_voto,
    relatorio_detalhado,
    resultados,
    unidades_assembleia,
    validar_procuracao,
    validar_voto_manual,
    verificar_voto,
    votacao_publica,
    votos_manuais,
)

urlpatterns = [
    path("<uuid:assembleia_id>/votar/", registrar_voto, name="registrar-voto"),
    path("<uuid:assembleia_id>/presenca/", registrar_presenca, name="registrar-presenca"),
    path("<uuid:assembleia_id>/presencas-captura/", presencas_captura, name="presencas-captura"),
    path("<uuid:assembleia_id>/votacao/", votacao_publica, name="votacao-publica"),
    path("<uuid:assembleia_id>/ja-votadas/", questoes_votadas, name="questoes-votadas"),
    path("<uuid:assembleia_id>/unidades/", unidades_assembleia, name="unidades-assembleia"),
    path("<uuid:assembleia_id>/procuracoes/", procuracoes_pendentes, name="procuracoes-pendentes"),
    path("<uuid:assembleia_id>/procuracoes/validar/", validar_procuracao, name="validar-procuracao"),
    path("<uuid:assembleia_id>/consultar-cpf/", consultar_cpf_votacao, name="consultar-cpf-votacao"),
    path("<uuid:assembleia_id>/acesso-facial/", acesso_facial, name="acesso-facial"),
    path("<uuid:assembleia_id>/acesso-manual/", acesso_manual, name="acesso-manual"),
    path("<uuid:assembleia_id>/votos-manuais/", votos_manuais, name="votos-manuais"),
    path("<uuid:assembleia_id>/votos-manuais/validar/", validar_voto_manual, name="validar-voto-manual"),
    path("<uuid:assembleia_id>/resultados/", resultados, name="resultados"),
    path("<uuid:assembleia_id>/relatorio/", relatorio_detalhado, name="relatorio-detalhado"),
    path("verificar/", verificar_voto, name="verificar-voto"),
]

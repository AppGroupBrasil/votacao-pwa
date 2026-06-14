import hashlib
import logging
import os
import uuid

from django.db import IntegrityError
from rest_framework.authentication import BaseAuthentication
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.condominios.models import Condominio
from apps.eleitores.models import Eleitor

audit = logging.getLogger("audit")


class _NoAuth(BaseAuthentication):
    def authenticate(self, request):
        return None


def _secret():
    return os.getenv("CADASTRO_SYNC_SECRET") or os.getenv("PROVISIONING_SECRET") or ""


def _digits(v):
    return "".join(ch for ch in str(v or "") if ch.isdigit())


def _stub_condominio(condominio_id, nome=None):
    cond, _ = Condominio.objects.get_or_create(
        id=condominio_id,
        defaults={
            "nome": nome or "Condomínio",
            "cnpj": f"SSO-{str(condominio_id)[:8]}",
            "total_unidades": 0,
        },
    )
    return cond


class CadastroSyncView(APIView):
    """Recebe os eventos de cadastro empurrados pela central (CadastroSyncService):
    {tipo, entidade, acao, condominio_id, dados}. Mantém Condominio + Eleitor em
    sincronia com o cadastro central (moradores -> eleitores)."""

    authentication_classes = [_NoAuth]
    permission_classes = [AllowAny]

    def post(self, request):
        secret = _secret()
        if not secret or request.headers.get("X-Provisioning-Secret", "") != secret:
            return Response({"error": "Assinatura inválida"}, status=403)

        body = request.data or {}
        entidade = body.get("entidade")
        acao = body.get("acao")
        condominio_id = body.get("condominio_id")
        dados = body.get("dados") or {}
        if not entidade or not condominio_id:
            return Response({"error": "Evento inválido"}, status=400)
        # condominio_id casa com Condominio.id (UUID); malformado => 400, não 500
        try:
            uuid.UUID(str(condominio_id))
        except (ValueError, TypeError, AttributeError):
            return Response({"error": "condominio_id inválido"}, status=400)

        if entidade == "condominio":
            self._upsert_condominio(condominio_id, dados)
        elif entidade == "morador":
            if acao == "delete":
                Eleitor.objects.filter(central_id=dados.get("id")).delete()
            else:
                self._upsert_morador(condominio_id, dados)
        # bloco/unidade/funcionario: sem entidade equivalente no app de votação.

        audit.info("cadastro_sync entidade=%s acao=%s cond=%s", entidade, acao, condominio_id)
        return Response({"ok": True})

    def _upsert_condominio(self, condominio_id, dados):
        cnpj = (dados.get("cnpj") or f"SSO-{str(condominio_id)[:8]}")[:18]
        Condominio.objects.update_or_create(
            id=condominio_id,
            defaults={
                "nome": (dados.get("nome") or "Condomínio")[:200],
                "cnpj": cnpj,
                "total_unidades": dados.get("total_unidades") or 0,
            },
        )

    def _upsert_morador(self, condominio_id, dados):
        central_id = dados.get("id")
        cond = _stub_condominio(condominio_id, dados.get("condominio_nome"))
        cpf = _digits(dados.get("cpf"))
        cpf_hash = hashlib.sha256(cpf.encode()).hexdigest() if cpf else None
        status = dados.get("status") or "ativo"
        valores = {
            "condominio": cond,
            "nome": (dados.get("nome") or "Morador")[:200],
            "email": (dados.get("email") or "")[:200],
            "apartamento": (str(dados.get("apartamento") or "") or "—")[:20],
            "bloco": str(dados.get("bloco") or "")[:20],
            "bloqueado": status not in ("ativo", "trial", ""),
        }

        eleitor = None
        if central_id:
            eleitor = Eleitor.objects.filter(central_id=central_id).first()
        if eleitor is None and cpf_hash:
            eleitor = Eleitor.objects.filter(cpf_hash=cpf_hash).first()

        if eleitor is not None:
            for campo, valor in valores.items():
                setattr(eleitor, campo, valor)
            if cpf_hash:
                eleitor.cpf_hash = cpf_hash
            if central_id:
                eleitor.central_id = central_id
            eleitor.save()
            return

        try:
            Eleitor.objects.create(central_id=central_id, cpf_hash=cpf_hash, **valores)
        except IntegrityError:
            # cpf_hash é único global: outro registro já o possui — atualiza-o.
            existente = Eleitor.objects.filter(cpf_hash=cpf_hash).first()
            if existente is None:
                raise
            for campo, valor in valores.items():
                setattr(existente, campo, valor)
            if central_id:
                existente.central_id = central_id
            existente.save()

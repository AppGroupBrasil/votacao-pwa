import logging

from django.core.management.base import BaseCommand
from django.utils import timezone

from apps.assembleias.models import Assembleia

audit = logging.getLogger("audit")


class Command(BaseCommand):
    help = "Encerra assembleias cuja data_fim já passou e ainda estão com status=ABERTA."

    def handle(self, *args, **options):
        agora = timezone.now()
        qs = Assembleia.objects.filter(
            status=Assembleia.Status.ABERTA,
            data_fim__lt=agora,
        )
        total = qs.count()
        if total == 0:
            return
        for assembleia in qs:
            assembleia.status = Assembleia.Status.ENCERRADA
            assembleia.save(update_fields=["status", "atualizado_em"])
            audit.info(
                "assembleia_encerrada_auto id=%s titulo=%r data_fim=%s",
                assembleia.id, assembleia.titulo, assembleia.data_fim.isoformat(),
            )
        self.stdout.write(self.style.SUCCESS(f"{total} assembleia(s) encerrada(s)."))

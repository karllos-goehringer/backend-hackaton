import type { NotificacaoCancelamento } from "./notificacao.types.js";

/**
 * Servico de notificacoes. Na implementacao atual, registra em memoria/log.
 * Em producao, integraria com envio de e-mails, push notifications ou fila AMQP/Kafka.
 */
export class NotificacoesService {
  private readonly pendentes: NotificacaoCancelamento[] = [];

  async notificarSolicitacaoCancelamento(notificacao: NotificacaoCancelamento): Promise<void> {
    this.pendentes.push(notificacao);
    console.log(
      `[NOTIFICACAO] Solicitacao de cancelamento para reserva ${notificacao.reservaId} ` +
      `solicitada por ${notificacao.solicitadoPorId} encaminhada ao coordenador ` +
      `(departamento: ${notificacao.departamentoId ?? "N/A"}).`,
    );
  }

  obterPendentes(): readonly NotificacaoCancelamento[] {
    return this.pendentes;
  }

  limpar(): void {
    this.pendentes.length = 0;
  }
}

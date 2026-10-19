import type { NotificacaoCancelamento, NotificacaoEncaminhamentoReserva } from "./notificacao.types.js";

/**
 * Servico de notificacoes. Na implementacao atual, registra em memoria/log.
 * Em producao, integraria com envio de e-mails, push notifications ou fila AMQP/Kafka.
 */
export class NotificacoesService {
  private readonly pendentes: NotificacaoCancelamento[] = [];
  private readonly encaminhamentos: NotificacaoEncaminhamentoReserva[] = [];

  async notificarSolicitacaoCancelamento(notificacao: NotificacaoCancelamento): Promise<void> {
    this.pendentes.push(notificacao);
    console.log(
      `[NOTIFICACAO] Solicitacao de cancelamento para reserva ${notificacao.reservaId} ` +
      `solicitada por ${notificacao.solicitadoPorId} encaminhada ao coordenador ` +
      `(departamento: ${notificacao.departamentoId ?? "N/A"}).`,
    );
  }

  async notificarEncaminhamentoReserva(notificacao: NotificacaoEncaminhamentoReserva): Promise<void> {
    this.encaminhamentos.push(notificacao);
    console.log(
      `[NOTIFICACAO] Reserva de aluno ${notificacao.reservaId} aceita pelo responsavel ` +
      `${notificacao.responsavelId} e encaminhada ao coordenador ` +
      `(departamento: ${notificacao.departamentoId ?? "N/A"}).`,
    );
  }

  obterPendentes(): readonly NotificacaoCancelamento[] {
    return this.pendentes;
  }

  obterEncaminhamentos(): readonly NotificacaoEncaminhamentoReserva[] {
    return this.encaminhamentos;
  }

  limpar(): void {
    this.pendentes.length = 0;
    this.encaminhamentos.length = 0;
  }
}

import {
  TipoNotificacao,
  type NotificacaoCancelamento,
  type NotificacaoEncaminhamentoReserva,
  type NotificacaoEstadoReserva,
} from "./notificacao.types.js";

export interface ObservadorNotificacaoReserva {
  atualizar(notificacao: NotificacaoEstadoReserva): void | Promise<void>;
}

export class ObservadorLogNotificacaoReserva implements ObservadorNotificacaoReserva {
  atualizar(notificacao: NotificacaoEstadoReserva): void {
    const destino = `solicitante ${notificacao.solicitanteId}`;
    const reserva = `reserva ${notificacao.reservaId}`;

    switch (notificacao.tipo) {
      case TipoNotificacao.CANCELAMENTO_RESERVA:
        console.log(
          `[NOTIFICACAO] ${destino} informado sobre o cancelamento da ${reserva}. ` +
          `Justificativa: ${notificacao.justificativa}`,
        );
        return;
      case TipoNotificacao.REJEICAO_RESERVA:
        console.log(
          `[NOTIFICACAO] ${destino} informado sobre a rejeicao da ${reserva}. ` +
          `Motivo: ${notificacao.motivo}`,
        );
        return;
      case TipoNotificacao.APROVACAO_RESERVA:
        console.log(`[NOTIFICACAO] ${destino} informado sobre a aprovacao/agendamento da ${reserva}.`);
    }
  }
}

/**
 * Servico de notificacoes. Na implementacao atual, registra em memoria/log.
 * Em producao, integraria com envio de e-mails, push notifications ou fila AMQP/Kafka.
 */
export class NotificacoesService {
  private readonly pendentes: NotificacaoCancelamento[] = [];
  private readonly encaminhamentos: NotificacaoEncaminhamentoReserva[] = [];
  private readonly notificacoesEstadoReserva: NotificacaoEstadoReserva[] = [];
  private readonly observadores = new Set<ObservadorNotificacaoReserva>([new ObservadorLogNotificacaoReserva()]);

  inscrever(observador: ObservadorNotificacaoReserva): () => void {
    this.observadores.add(observador);
    return () => this.observadores.delete(observador);
  }

  async notificarEstadoReserva(notificacao: NotificacaoEstadoReserva): Promise<void> {
    this.notificacoesEstadoReserva.push(notificacao);
    await Promise.all([...this.observadores].map((observador) => observador.atualizar(notificacao)));
  }

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

  obterNotificacoesEstadoReserva(): readonly NotificacaoEstadoReserva[] {
    return this.notificacoesEstadoReserva;
  }

  limpar(): void {
    this.pendentes.length = 0;
    this.encaminhamentos.length = 0;
    this.notificacoesEstadoReserva.length = 0;
  }
}

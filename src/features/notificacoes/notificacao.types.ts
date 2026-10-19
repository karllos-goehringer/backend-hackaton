export enum TipoNotificacao {
  SOLICITACAO_CANCELAMENTO = "SOLICITACAO_CANCELAMENTO",
  ENCAMINHAMENTO_RESERVA_ALUNO = "ENCAMINHAMENTO_RESERVA_ALUNO",
  CANCELAMENTO_RESERVA = "CANCELAMENTO_RESERVA",
  REJEICAO_RESERVA = "REJEICAO_RESERVA",
  APROVACAO_RESERVA = "APROVACAO_RESERVA",
}

export interface DadosNotificacaoEstadoReserva {
  reservaId: string;
  solicitanteId: string;
  alteradoPorId: string;
  dataHoraInicio: Date;
  dataHoraFim: Date;
  criadoEm: Date;
}

export type NotificacaoEstadoReserva =
  | (DadosNotificacaoEstadoReserva & {
      tipo: TipoNotificacao.CANCELAMENTO_RESERVA;
      justificativa: string;
    })
  | (DadosNotificacaoEstadoReserva & {
      tipo: TipoNotificacao.REJEICAO_RESERVA;
      motivo: string;
    })
  | (DadosNotificacaoEstadoReserva & {
      tipo: TipoNotificacao.APROVACAO_RESERVA;
    });

export interface NotificacaoCancelamento {
  tipo: TipoNotificacao.SOLICITACAO_CANCELAMENTO;
  reservaId: string;
  solicitadoPorId: string;
  coordenadorId?: string;
  departamentoId?: string;
  justificativa: string;
  criadoEm: Date;
}

export interface NotificacaoEncaminhamentoReserva {
  tipo: TipoNotificacao.ENCAMINHAMENTO_RESERVA_ALUNO;
  reservaId: string;
  solicitanteId: string;
  responsavelId: string;
  departamentoId?: string;
  criadoEm: Date;
}

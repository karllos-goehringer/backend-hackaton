export enum TipoNotificacao {
  SOLICITACAO_CANCELAMENTO = "SOLICITACAO_CANCELAMENTO",
  ENCAMINHAMENTO_RESERVA_ALUNO = "ENCAMINHAMENTO_RESERVA_ALUNO",
}

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

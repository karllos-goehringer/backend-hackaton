export enum TipoNotificacao {
  SOLICITACAO_CANCELAMENTO = "SOLICITACAO_CANCELAMENTO",
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

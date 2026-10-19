import type { LocalizacaoSala } from "../../salas/salas.repository.js";

export interface LotacaoCoordenacaoDados {
  predioId: string;
  setorId: string | null;
  dataInicio: Date; // data civil a 00:00 UTC
  dataFim: Date | null; // data civil a 00:00 UTC (inclusiva); null = sem termino definido
  ativo: boolean;
}

/** Lotacao vigente: ativa e com `hoje` dentro do periodo da portaria (inclusivo). */
export function estaVigente(lotacao: LotacaoCoordenacaoDados, hoje: Date): boolean {
  if (!lotacao.ativo) return false;
  if (lotacao.dataInicio.getTime() > hoje.getTime()) return false;
  return lotacao.dataFim === null || lotacao.dataFim.getTime() >= hoje.getTime();
}

/** A lotacao cobre a sala se for do mesmo Predio, ou se tiver Setor definido igual ao Setor do Predio. */
export function cobreSala(lotacao: LotacaoCoordenacaoDados, sala: LocalizacaoSala): boolean {
  if (lotacao.predioId === sala.predioId) return true;
  return lotacao.setorId !== null && lotacao.setorId === sala.setorId;
}


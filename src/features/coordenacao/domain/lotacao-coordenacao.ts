import type { LocalizacaoSala } from "../../salas/salas.repository.js";

export interface LotacaoCoordenacaoDados {
  predioId: string;
  setorId: string | null;
  ativo: boolean;
}

/** A coordenacao permanece vigente ate a lotacao ser desativada. */
export function estaAtiva(lotacao: LotacaoCoordenacaoDados): boolean {
  return lotacao.ativo;
}

/** A lotacao cobre a sala se for do mesmo Predio, ou se tiver Setor definido igual ao Setor do Predio. */
export function cobreSala(lotacao: LotacaoCoordenacaoDados, sala: LocalizacaoSala): boolean {
  if (lotacao.predioId === sala.predioId) return true;
  return lotacao.setorId !== null && sala.setorId !== null && lotacao.setorId === sala.setorId;
}

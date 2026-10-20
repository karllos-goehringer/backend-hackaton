import type { LocalizacaoSala } from "../../salas/salas.repository.js";

export interface LotacaoCoordenacaoDados {
  predioId: string;
  ativo: boolean;
  dataInicio?: Date;
  dataFim?: Date | null;
}

/** A coordenacao permanece vigente ate a lotacao ser desativada. */
export function estaAtiva(lotacao: LotacaoCoordenacaoDados): boolean {
  return lotacao.ativo;
}

/**
 * A lotacao cobre a sala estritamente quando pertence ao mesmo Predio coordenado.
 * Compartilhar unidade/departamento de coordenacao nao concede acesso a outros predios.
 */
export function cobreSala(lotacao: LotacaoCoordenacaoDados, sala: LocalizacaoSala): boolean {
  return lotacao.predioId === sala.predioId;
}

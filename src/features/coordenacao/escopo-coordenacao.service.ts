import type { LocalizacaoSala } from "../salas/salas.repository.js";
import { cobreSala, estaAtiva } from "./domain/lotacao-coordenacao.js";
import type { LotacoesRepository } from "./lotacoes.repository.js";

/**
 * Responde se um docente tem uma lotacao ativa de coordenador sobre a sala.
 */
export class EscopoCoordenacaoService {
  constructor(private readonly lotacoes: LotacoesRepository) {}

  async coordenaSala(docenteId: string, sala: LocalizacaoSala): Promise<boolean> {
    const lotacoes = await this.lotacoes.listarPorDocente(docenteId);
    return lotacoes.some((lotacao) => estaAtiva(lotacao) && cobreSala(lotacao, sala));
  }
}

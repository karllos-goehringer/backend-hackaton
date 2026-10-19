import { dataCivil } from "../../shared/utils/data-hora.js";
import type { LocalizacaoSala } from "../salas/salas.repository.js";
import { cobreSala, estaVigente } from "./domain/lotacao-coordenacao.js";
import type { LotacoesRepository } from "./lotacoes.repository.js";

/**
 * Responde se um docente exerce, no momento, o papel de coordenador sobre uma sala
 * (Role Object: o papel deriva das lotacoes vigentes, nao de um tipo fixo de usuario).
 */
export class EscopoCoordenacaoService {
  constructor(private readonly lotacoes: LotacoesRepository) {}

  async coordenaSala(docenteId: string, sala: LocalizacaoSala, agora: Date): Promise<boolean> {
    const hoje = dataCivil(agora);
    const lotacoes = await this.lotacoes.listarPorDocente(docenteId);
    return lotacoes.some((lotacao) => estaVigente(lotacao, hoje) && cobreSala(lotacao, sala));
  }
}


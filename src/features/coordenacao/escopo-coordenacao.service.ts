import type { LocalizacaoSala } from "../salas/salas.repository.js";
import { cobreSala, estaAtiva, type LotacaoCoordenacaoDados } from "./domain/lotacao-coordenacao.js";
import type { LotacoesRepository } from "./lotacoes.repository.js";

/**
 * Responde se um docente/coordenador possui lotacao ativa de coordenacao sobre o predio/sala.
 */
export class EscopoCoordenacaoService {
  constructor(private readonly lotacoes: LotacoesRepository) {}

  private async obterLotacoes(docenteId: string): Promise<LotacaoCoordenacaoDados[]> {
    const repo = this.lotacoes as LotacoesRepository & {
      listarAtivasDoDocente?: (id: string) => Promise<LotacaoCoordenacaoDados[]>;
    };
    if (typeof repo.listarPorDocente === "function") {
      return repo.listarPorDocente(docenteId);
    }
    if (typeof repo.listarAtivasDoDocente === "function") {
      return repo.listarAtivasDoDocente(docenteId);
    }
    return [];
  }

  async coordenaSala(docenteId: string, sala: LocalizacaoSala): Promise<boolean> {
    const lotacoes = await this.obterLotacoes(docenteId);
    return lotacoes.some((lotacao) => estaAtiva(lotacao) && cobreSala(lotacao, sala));
  }

  async coordenaPredio(docenteId: string, predioId: string): Promise<boolean> {
    const lotacoes = await this.obterLotacoes(docenteId);
    return lotacoes.some((lotacao) => estaAtiva(lotacao) && lotacao.predioId === predioId);
  }

  async listarPrediosCoordenados(docenteId: string): Promise<string[]> {
    const lotacoes = await this.obterLotacoes(docenteId);
    return lotacoes.filter((lotacao) => estaAtiva(lotacao)).map((lotacao) => lotacao.predioId);
  }
}

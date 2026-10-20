import type { LocalizacaoSala } from "../salas/salas.repository.js";
import { estaAtiva, type LotacaoCoordenacaoDados } from "./domain/lotacao-coordenacao.js";
import type { LotacoesRepository } from "./lotacoes.repository.js";

/**
 * Responde se um docente/servidor possui lotacao ativa de coordenacao.
 * A hierarquia de coordenador e institucional e nao e mais separada por predio/predios.
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

  async ehCoordenadorAtivo(docenteId: string): Promise<boolean> {
    const lotacoes = await this.obterLotacoes(docenteId);
    return lotacoes.some((lotacao) => estaAtiva(lotacao));
  }

  async coordenaSala(docenteId: string, _sala?: LocalizacaoSala): Promise<boolean> {
    return this.ehCoordenadorAtivo(docenteId);
  }

  async coordenaPredio(docenteId: string, _predioId?: string): Promise<boolean> {
    return this.ehCoordenadorAtivo(docenteId);
  }

  async listarPrediosCoordenados(docenteId: string): Promise<string[]> {
    const lotacoes = await this.obterLotacoes(docenteId);
    return lotacoes.filter((lotacao) => estaAtiva(lotacao)).map((lotacao) => lotacao.predioId);
  }
}

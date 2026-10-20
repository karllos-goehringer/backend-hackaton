import type { DbClient } from "../../shared/database/transacao.js";
import type { LotacaoCoordenacaoDados } from "./domain/lotacao-coordenacao.js";

export class LotacoesRepository {
  constructor(private readonly db: DbClient) {}

  /** Retorna as lotacoes do docente; a regra de vigencia/escopo fica no dominio. */
  listarPorDocente(docenteId: string): Promise<LotacaoCoordenacaoDados[]> {
    return this.db.lotacaoCoordenacao.findMany({
      where: { docenteId },
      select: { predioId: true, setorId: true, ativo: true },
    });
  }
}

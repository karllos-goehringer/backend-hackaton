import type { DbClient } from "../../shared/database/transacao.js";
import type { LotacaoCoordenacaoDados } from "./domain/lotacao-coordenacao.js";

export interface LotacaoCoordenacaoDetalhada extends LotacaoCoordenacaoDados {
  id: string;
  docenteId: string;
  numeroPortaria: string;
  coordenador: {
    id: string;
    nome: string;
    emailInstitucional: string | null;
    codigoLogin: string;
    tipoCredencial: string;
  };
  predio: {
    id: string;
    nome: string;
    campusId: string | null;
    setorId: string | null;
  };
  setor: {
    id: string;
    nome: string;
    sigla: string | null;
  } | null;
}

export class LotacoesRepository {
  constructor(private readonly db: DbClient) {}

  /** Retorna as lotacoes do docente; a regra de vigencia/escopo fica no dominio. */
  listarPorDocente(docenteId: string): Promise<LotacaoCoordenacaoDados[]> {
    return this.db.lotacaoCoordenacao.findMany({
      where: { docenteId },
      select: { predioId: true, setorId: true, ativo: true },
    });
  }

  /** Retorna as lotacoes ativas com objetos associados de coordenador e predio. */
  async listarAtivasComDetalhesPorDocente(docenteId: string): Promise<LotacaoCoordenacaoDetalhada[]> {
    const lotacoes = await this.db.lotacaoCoordenacao.findMany({
      where: { docenteId, ativo: true },
      select: {
        id: true,
        docenteId: true,
        predioId: true,
        setorId: true,
        numeroPortaria: true,
        ativo: true,
        docente: {
          select: {
            id: true,
            nome: true,
            emailInstitucional: true,
            codigoLogin: true,
            tipoCredencial: true,
          },
        },
        predio: {
          select: {
            id: true,
            nome: true,
            campusId: true,
            setorId: true,
          },
        },
        setor: {
          select: {
            id: true,
            nome: true,
            sigla: true,
          },
        },
      },
    });

    return lotacoes.map(({ docente, ...resto }) => ({
      ...resto,
      coordenador: docente,
    }));
  }
}

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
  };
}

export class LotacoesRepository {
  constructor(private readonly db: DbClient) {}

  /** Retorna as lotacoes do docente; a regra de vigencia/escopo fica no dominio. */
  listarPorDocente(docenteId: string): Promise<LotacaoCoordenacaoDados[]> {
    return this.db.lotacaoCoordenacao.findMany({
      where: { docenteId },
      select: { predioId: true, ativo: true },
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
          },
        },
      },
    });

    return lotacoes.map(({ docente, ...resto }) => ({
      ...resto,
      coordenador: docente,
    }));
  }

  async listar(filtros?: { docenteId?: string; predioId?: string; ativo?: boolean }): Promise<LotacaoCoordenacaoDetalhada[]> {
    const where: Record<string, unknown> = {};
    if (filtros?.docenteId) where.docenteId = filtros.docenteId;
    if (filtros?.predioId) where.predioId = filtros.predioId;
    if (filtros?.ativo !== undefined) where.ativo = filtros.ativo;

    const lotacoes = await this.db.lotacaoCoordenacao.findMany({
      where,
      select: {
        id: true,
        docenteId: true,
        predioId: true,
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
          },
        },
      },
    });

    return lotacoes.map(({ docente, ...resto }) => ({
      ...resto,
      coordenador: docente,
    }));
  }

  async buscarPorId(id: string): Promise<LotacaoCoordenacaoDetalhada | null> {
    const lotacao = await this.db.lotacaoCoordenacao.findUnique({
      where: { id },
      select: {
        id: true,
        docenteId: true,
        predioId: true,
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
          },
        },
      },
    });

    if (!lotacao) return null;
    const { docente, ...resto } = lotacao;
    return { ...resto, coordenador: docente };
  }

  async criar(dados: {
    docenteId: string;
    predioId: string;
    numeroPortaria: string;
    ativo?: boolean;
  }): Promise<LotacaoCoordenacaoDetalhada> {
    const criada = await this.db.lotacaoCoordenacao.create({
      data: {
        docenteId: dados.docenteId,
        predioId: dados.predioId,
        numeroPortaria: dados.numeroPortaria,
        ativo: dados.ativo ?? true,
      },
    });
    return (await this.buscarPorId(criada.id))!;
  }

  async atualizar(
    id: string,
    dados: {
      docenteId?: string;
      predioId?: string;
      numeroPortaria?: string;
      ativo?: boolean;
    },
  ): Promise<LotacaoCoordenacaoDetalhada> {
    await this.db.lotacaoCoordenacao.update({
      where: { id },
      data: dados,
    });
    return (await this.buscarPorId(id))!;
  }

  async remover(id: string): Promise<void> {
    await this.db.lotacaoCoordenacao.delete({
      where: { id },
    });
  }
}

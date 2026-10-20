import type { Endereco, Prisma, TipoSala } from "@prisma/client";
import type { DbClient } from "../../shared/database/transacao.js";

export interface SalaDoPredio {
  id: string;
  nome: string;
  nomeSala: string;
  capacidade: number | null;
  predioId: string;
  ativa: boolean;
  codigo: string | null;
  numSala: number | null;
  andar: number | null;
  tipo: TipoSala | null;
}

export interface PredioResumo {
  id: string;
  nome: string;
  campusId: string | null;
  endereco: Endereco | null;
}

export interface PredioComSalas extends PredioResumo {
  salas: SalaDoPredio[];
}

export interface FiltrosListagemPredios {
  nome?: string;
  incluirSalas?: boolean;
  incluirInativas?: boolean;
}

export interface CriarPredioDados {
  nome: string;
  campusId?: string | null;
  endereco?: Endereco | null;
}

export interface AtualizarPredioDados {
  nome?: string;
  campusId?: string | null;
  endereco?: Endereco | null;
}

const SELECT_PREDIO_RESUMO = {
  id: true,
  nome: true,
  campusId: true,
  endereco: true,
} satisfies Prisma.PredioSelect;

const SELECT_SALA_DO_PREDIO = {
  id: true,
  predioId: true,
  codigo: true,
  numSala: true,
  nomeSala: true,
  andar: true,
  capacidade: true,
  tipo: true,
  ativa: true,
} satisfies Prisma.SalaSelect;

type SalaDoPredioSelecionada = Prisma.SalaGetPayload<{ select: typeof SELECT_SALA_DO_PREDIO }>;

function mapearSalaDoPredio(sala: SalaDoPredioSelecionada): SalaDoPredio {
  return {
    id: sala.id,
    nome: sala.nomeSala,
    nomeSala: sala.nomeSala,
    capacidade: sala.capacidade,
    predioId: sala.predioId,
    ativa: sala.ativa,
    codigo: sala.codigo,
    numSala: sala.numSala,
    andar: sala.andar,
    tipo: sala.tipo,
  };
}

export class PrediosRepository {
  constructor(private readonly db: DbClient) {}

  async listar(filtros: FiltrosListagemPredios = {}): Promise<(PredioResumo | PredioComSalas)[]> {
    const where: Prisma.PredioWhereInput = {
      ...(filtros.nome ? { nome: { contains: filtros.nome, mode: "insensitive" } } : {}),
    };

    if (filtros.incluirSalas) {
      const predios = await this.db.predio.findMany({
        where,
        select: {
          ...SELECT_PREDIO_RESUMO,
          salas: {
            where: filtros.incluirInativas ? {} : { ativa: true },
            select: SELECT_SALA_DO_PREDIO,
            orderBy: { nomeSala: "asc" },
          },
        },
        orderBy: { nome: "asc" },
      });

      return predios.map((predio) => ({
        id: predio.id,
        nome: predio.nome,
        campusId: predio.campusId,
        endereco: predio.endereco,
        salas: predio.salas.map(mapearSalaDoPredio),
      }));
    }

    return this.db.predio.findMany({
      where,
      select: SELECT_PREDIO_RESUMO,
      orderBy: { nome: "asc" },
    });
  }

  async buscarPorIdComSalas(
    id: string,
    opcoes: { incluirInativas?: boolean } = {},
  ): Promise<PredioComSalas | null> {
    const predio = await this.db.predio.findUnique({
      where: { id },
      select: {
        ...SELECT_PREDIO_RESUMO,
        salas: {
          where: opcoes.incluirInativas ? {} : { ativa: true },
          select: SELECT_SALA_DO_PREDIO,
          orderBy: { nomeSala: "asc" },
        },
      },
    });
    if (!predio) return null;

    return {
      id: predio.id,
      nome: predio.nome,
      campusId: predio.campusId,
      endereco: predio.endereco,
      salas: predio.salas.map(mapearSalaDoPredio),
    };
  }

  buscarResumoPorId(id: string): Promise<PredioResumo | null> {
    return this.db.predio.findUnique({
      where: { id },
      select: SELECT_PREDIO_RESUMO,
    });
  }

  buscarPorNome(nome: string): Promise<PredioResumo | null> {
    return this.db.predio.findUnique({
      where: { nome },
      select: SELECT_PREDIO_RESUMO,
    });
  }

  criar(dados: CriarPredioDados): Promise<PredioResumo> {
    return this.db.predio.create({
      data: {
        nome: dados.nome,
        campusId: dados.campusId ?? null,
        endereco: dados.endereco ?? null,
      },
      select: SELECT_PREDIO_RESUMO,
    });
  }

  atualizar(id: string, dados: AtualizarPredioDados): Promise<PredioResumo> {
    return this.db.predio.update({
      where: { id },
      data: {
        ...(dados.nome !== undefined ? { nome: dados.nome } : {}),
        ...(dados.campusId !== undefined ? { campusId: dados.campusId } : {}),
        ...(dados.endereco !== undefined ? { endereco: dados.endereco } : {}),
      },
      select: SELECT_PREDIO_RESUMO,
    });
  }

  contarSalasPorPredio(id: string): Promise<number> {
    return this.db.sala.count({ where: { predioId: id } });
  }

  async remover(id: string): Promise<void> {
    await this.db.predio.delete({ where: { id } });
  }
}

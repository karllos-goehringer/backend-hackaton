import type { Prisma, TipoSala } from "@prisma/client";
import type { DbClient } from "../../shared/database/transacao.js";

/** Localizacao territorial de uma sala, usada no escopo de coordenacao. */
export interface LocalizacaoSala {
  predioId: string;
  setorId: string | null;
}

export interface SalaParaReserva extends LocalizacaoSala {
  id: string;
  codigo: string | null;
  nomeSala: string;
  capacidade: number | null;
  ativa: boolean;
}

export interface PredioResumoSala {
  id: string;
  nome: string;
  campusId: string | null;
  setorId: string | null;
}

export interface SalaComPredio {
  id: string;
  nome: string;
  nomeSala: string;
  capacidade: number | null;
  predioId: string;
  predio: PredioResumoSala;
  ativa: boolean;
  codigo: string | null;
  numSala: number | null;
  andar: number | null;
  tipo: TipoSala | null;
}

export interface FiltrosBuscaSalas {
  predioId?: string;
  predioNome?: string;
  nome?: string;
  capacidadeMin?: number;
  capacidadeMax?: number;
  apenasComCapacidade?: boolean;
  semCapacidade?: boolean;
  tipo?: TipoSala;
  incluirInativas?: boolean;
}

export interface CriarSalaDados {
  predioId: string;
  nomeSala: string;
  capacidade?: number | null;
  codigo?: string | null;
  numSala?: number | null;
  andar?: number | null;
  tipo?: TipoSala | null;
  ativa?: boolean;
}

export interface AtualizarSalaDados {
  predioId?: string;
  nomeSala?: string;
  capacidade?: number | null;
  codigo?: string | null;
  numSala?: number | null;
  andar?: number | null;
  tipo?: TipoSala | null;
  ativa?: boolean;
}

const SELECT_SALA_COM_PREDIO = {
  id: true,
  predioId: true,
  codigo: true,
  numSala: true,
  nomeSala: true,
  andar: true,
  capacidade: true,
  tipo: true,
  ativa: true,
  predio: {
    select: {
      id: true,
      nome: true,
      campusId: true,
      setorId: true,
    },
  },
} satisfies Prisma.SalaSelect;

type SalaSelecionada = Prisma.SalaGetPayload<{ select: typeof SELECT_SALA_COM_PREDIO }>;

function mapearSalaComPredio(sala: SalaSelecionada): SalaComPredio {
  return {
    id: sala.id,
    nome: sala.nomeSala,
    nomeSala: sala.nomeSala,
    capacidade: sala.capacidade,
    predioId: sala.predioId,
    predio: {
      id: sala.predio.id,
      nome: sala.predio.nome,
      campusId: sala.predio.campusId,
      setorId: sala.predio.setorId,
    },
    ativa: sala.ativa,
    codigo: sala.codigo,
    numSala: sala.numSala,
    andar: sala.andar,
    tipo: sala.tipo,
  };
}

export function construirWhereSalas(filtros: FiltrosBuscaSalas = {}): Prisma.SalaWhereInput {
  const where: Prisma.SalaWhereInput = {};

  if (!filtros.incluirInativas) {
    where.ativa = true;
  }

  if (filtros.predioId) {
    where.predioId = filtros.predioId;
  }

  if (filtros.predioNome) {
    where.predio = {
      nome: { contains: filtros.predioNome, mode: "insensitive" },
    };
  }

  if (filtros.nome) {
    where.nomeSala = { contains: filtros.nome, mode: "insensitive" };
  }

  if (filtros.tipo) {
    where.tipo = filtros.tipo;
  }

  if (filtros.semCapacidade) {
    where.capacidade = null;
  } else if (
    filtros.capacidadeMin !== undefined ||
    filtros.capacidadeMax !== undefined ||
    filtros.apenasComCapacidade
  ) {
    where.capacidade = {
      not: null,
      ...(filtros.capacidadeMin !== undefined ? { gte: filtros.capacidadeMin } : {}),
      ...(filtros.capacidadeMax !== undefined ? { lte: filtros.capacidadeMax } : {}),
    };
  }

  return where;
}

export class SalasRepository {
  constructor(private readonly db: DbClient) {}

  async buscarParaReserva(id: string): Promise<SalaParaReserva | null> {
    const sala = await this.db.sala.findUnique({
      where: { id },
      select: {
        id: true,
        codigo: true,
        nomeSala: true,
        capacidade: true,
        ativa: true,
        predioId: true,
        predio: { select: { setorId: true } },
      },
    });
    if (!sala) return null;
    return {
      id: sala.id,
      codigo: sala.codigo,
      nomeSala: sala.nomeSala,
      capacidade: sala.capacidade,
      ativa: sala.ativa,
      predioId: sala.predioId,
      setorId: sala.predio.setorId,
    };
  }

  async listar(filtros: FiltrosBuscaSalas = {}): Promise<SalaComPredio[]> {
    const salas = await this.db.sala.findMany({
      where: construirWhereSalas(filtros),
      select: SELECT_SALA_COM_PREDIO,
      orderBy: [{ predioId: "asc" }, { nomeSala: "asc" }],
    });
    return salas.map(mapearSalaComPredio);
  }

  async buscarPorId(id: string): Promise<SalaComPredio | null> {
    const sala = await this.db.sala.findUnique({
      where: { id },
      select: SELECT_SALA_COM_PREDIO,
    });
    return sala ? mapearSalaComPredio(sala) : null;
  }

  async buscarPorPredioENome(predioId: string, nomeSala: string): Promise<SalaComPredio | null> {
    const sala = await this.db.sala.findUnique({
      where: {
        predioId_nomeSala: { predioId, nomeSala },
      },
      select: SELECT_SALA_COM_PREDIO,
    });
    return sala ? mapearSalaComPredio(sala) : null;
  }

  async criar(dados: CriarSalaDados): Promise<SalaComPredio> {
    const sala = await this.db.sala.create({
      data: {
        predioId: dados.predioId,
        nomeSala: dados.nomeSala,
        capacidade: dados.capacidade ?? null,
        codigo: dados.codigo ?? null,
        numSala: dados.numSala ?? null,
        andar: dados.andar ?? null,
        tipo: dados.tipo ?? null,
        ativa: dados.ativa ?? true,
      },
      select: SELECT_SALA_COM_PREDIO,
    });
    return mapearSalaComPredio(sala);
  }

  async atualizar(id: string, dados: AtualizarSalaDados): Promise<SalaComPredio> {
    const sala = await this.db.sala.update({
      where: { id },
      data: {
        ...(dados.predioId !== undefined ? { predioId: dados.predioId } : {}),
        ...(dados.nomeSala !== undefined ? { nomeSala: dados.nomeSala } : {}),
        ...(dados.capacidade !== undefined ? { capacidade: dados.capacidade } : {}),
        ...(dados.codigo !== undefined ? { codigo: dados.codigo } : {}),
        ...(dados.numSala !== undefined ? { numSala: dados.numSala } : {}),
        ...(dados.andar !== undefined ? { andar: dados.andar } : {}),
        ...(dados.tipo !== undefined ? { tipo: dados.tipo } : {}),
        ...(dados.ativa !== undefined ? { ativa: dados.ativa } : {}),
      },
      select: SELECT_SALA_COM_PREDIO,
    });
    return mapearSalaComPredio(sala);
  }

  async contarReservasPorSala(id: string): Promise<number> {
    return this.db.reserva.count({ where: { salaId: id } });
  }

  async remover(id: string): Promise<void> {
    await this.db.sala.delete({ where: { id } });
  }

  /**
   * Escreve no documento da sala para serializar transacoes concorrentes sobre a sua agenda.
   * Substitui o `EXCLUDE USING gist` do PostgreSQL: a segunda transacao recebe write conflict,
   * e reexecutada e enxerga a reserva ja confirmada.
   */
  async travarAgenda(id: string): Promise<void> {
    await this.db.sala.update({
      where: { id },
      data: { versaoAgenda: { increment: 1 } },
      select: { id: true },
    });
  }
}

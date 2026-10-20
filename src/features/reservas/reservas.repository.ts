import type { Prisma, Reserva, SerieRecorrencia, StatusReserva, TipoCredencial } from "@prisma/client";
import type { DbClient } from "../../shared/database/transacao.js";

export interface ReservaComLocalizacao extends Reserva {
  predioId: string;
  setorId: string | null;
  solicitanteTipo?: TipoCredencial;
  solicitanteEhCoordenador?: boolean;
  responsavelEhCoordenador?: boolean;
  responsavelDepartamentoId?: string | null;
}

export interface IntervaloReservado {
  id: string;
  inicio: Date;
  fim: Date;
}

export interface ReservaParaCancelamento extends ReservaComLocalizacao {
  solicitanteTipo: TipoCredencial;
  responsavelDepartamentoId: string | null;
}

export interface FiltrosListagemReservas {
  salaId?: string;
  predioId?: string;
  status?: StatusReserva;
  solicitanteId?: string;
  responsavelId?: string;
  inicio?: Date;
  fim?: Date;
}

const RESERVA_COM_DETALHES = {
  include: {
    sala: {
      select: {
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
            endereco: true,
            campus: { select: { id: true, nome: true, sigla: true } },
            setor: { select: { id: true, nome: true, sigla: true } },
          },
        },
        recursos: { select: { id: true, descricao: true } },
      },
    },
    solicitante: {
      select: {
        id: true,
        nome: true,
        emailInstitucional: true,
        telefone: true,
        codigoLogin: true,
        tipoCredencial: true,
        nivelAcesso: true,
        curso: { select: { id: true, nome: true } },
        departamento: { select: { id: true, nome: true } },
      },
    },
    responsavel: {
      select: {
        id: true,
        nome: true,
        emailInstitucional: true,
        telefone: true,
        codigoLogin: true,
        tipoCredencial: true,
        nivelAcesso: true,
        curso: { select: { id: true, nome: true } },
        departamento: { select: { id: true, nome: true } },
      },
    },
    analisadoPor: {
      select: {
        id: true,
        nome: true,
        emailInstitucional: true,
        codigoLogin: true,
        tipoCredencial: true,
        nivelAcesso: true,
      },
    },
    serieRecorrencia: {
      select: {
        id: true,
        tipoRecorrencia: true,
        dataInicio: true,
        dataFim: true,
        diasSemana: true,
        criadoEm: true,
      },
    },
  },
} satisfies Prisma.ReservaDefaultArgs;

export type ReservaDetalhada = Prisma.ReservaGetPayload<typeof RESERVA_COM_DETALHES>;

/** Acesso a dados de reservas. Sem regras de negocio: apenas consultas e escritas parametrizadas. */
export class ReservasRepository {
  constructor(private readonly db: DbClient) {}

  buscarDetalhesPorId(id: string): Promise<ReservaDetalhada | null> {
    return this.db.reserva.findUnique({ where: { id }, ...RESERVA_COM_DETALHES });
  }

  listarDetalhes(filtros: FiltrosListagemReservas = {}): Promise<ReservaDetalhada[]> {
    return this.db.reserva.findMany({
      ...RESERVA_COM_DETALHES,
      where: {
        ...(filtros.salaId ? { salaId: filtros.salaId } : {}),
        ...(filtros.predioId ? { sala: { predioId: filtros.predioId } } : {}),
        ...(filtros.status ? { status: filtros.status } : {}),
        ...(filtros.solicitanteId ? { solicitanteId: filtros.solicitanteId } : {}),
        ...(filtros.responsavelId ? { responsavelId: filtros.responsavelId } : {}),
        ...(filtros.inicio || filtros.fim
          ? {
              dataHoraInicio: {
                ...(filtros.inicio ? { gte: filtros.inicio } : {}),
                ...(filtros.fim ? { lt: filtros.fim } : {}),
              },
            }
          : {}),
      },
      orderBy: { dataHoraInicio: "asc" },
    });
  }

  listarDetalhesPorSerie(serieRecorrenciaId: string): Promise<ReservaDetalhada[]> {
    return this.db.reserva.findMany({
      ...RESERVA_COM_DETALHES,
      where: { serieRecorrenciaId },
      orderBy: { dataHoraInicio: "asc" },
    });
  }

  buscarPorId(id: string): Promise<Reserva | null> {
    return this.db.reserva.findUnique({ where: { id } });
  }

  listar(filtros: FiltrosListagemReservas = {}): Promise<Reserva[]> {
    return this.db.reserva.findMany({
      where: {
        ...(filtros.salaId ? { salaId: filtros.salaId } : {}),
        ...(filtros.predioId ? { sala: { predioId: filtros.predioId } } : {}),
        ...(filtros.status ? { status: filtros.status } : {}),
        ...(filtros.solicitanteId ? { solicitanteId: filtros.solicitanteId } : {}),
        ...(filtros.responsavelId ? { responsavelId: filtros.responsavelId } : {}),
        ...(filtros.inicio || filtros.fim
          ? {
              dataHoraInicio: {
                ...(filtros.inicio ? { gte: filtros.inicio } : {}),
                ...(filtros.fim ? { lt: filtros.fim } : {}),
              },
            }
          : {}),
      },
      orderBy: { dataHoraInicio: "asc" },
    });
  }

  async buscarComLocalizacao(id: string): Promise<ReservaComLocalizacao | null> {
    const reserva = await this.db.reserva.findUnique({
      where: { id },
      include: {
        sala: { select: { predioId: true, predio: { select: { setorId: true } } } },
        solicitante: {
          select: {
            id: true,
            tipoCredencial: true,
            nivelAcesso: true,
            lotacoesCoordenacao: { where: { ativo: true }, select: { id: true } },
          },
        },
        responsavel: {
          select: {
            id: true,
            tipoCredencial: true,
            nivelAcesso: true,
            departamentoId: true,
            lotacoesCoordenacao: { where: { ativo: true }, select: { id: true } },
          },
        },
      },
    });
    if (!reserva) return null;
    const { sala, solicitante, responsavel, ...dados } = reserva as typeof reserva & {
      solicitante?: {
        id: string;
        tipoCredencial: TipoCredencial;
        nivelAcesso?: number;
        lotacoesCoordenacao?: Array<{ id: string }>;
      } | null;
      responsavel?: {
        id: string;
        tipoCredencial: TipoCredencial;
        nivelAcesso?: number;
        departamentoId?: string | null;
        lotacoesCoordenacao?: Array<{ id: string }>;
      } | null;
    };
    return {
      ...dados,
      predioId: sala.predioId,
      setorId: sala.predio.setorId,
      ...(solicitante?.tipoCredencial ? { solicitanteTipo: solicitante.tipoCredencial } : {}),
      solicitanteEhCoordenador:
        solicitante?.nivelAcesso === 4 || (solicitante?.lotacoesCoordenacao?.length ?? 0) > 0,
      responsavelEhCoordenador:
        responsavel?.nivelAcesso === 4 || (responsavel?.lotacoesCoordenacao?.length ?? 0) > 0,
      responsavelDepartamentoId: responsavel?.departamentoId ?? null,
    };
  }

  contarPorSolicitanteEStatusDesde(solicitanteId: string, status: StatusReserva, desde: Date): Promise<number> {
    return this.db.reserva.count({
      where: { solicitanteId, status, criadoEm: { gte: desde } },
    });
  }

  /** Conta reservas ativas (nao canceladas/rejeitadas) criadas pelo solicitante desde o instante informado. */
  contarAtivasPorSolicitanteDesde(solicitanteId: string, desde: Date): Promise<number> {
    return this.db.reserva.count({
      where: {
        solicitanteId,
        status: { notIn: ["CANCELADA", "REJEITADA"] },
        criadoEm: { gte: desde },
      },
    });
  }

  /** Conta reservas ativas (nao canceladas/rejeitadas) do solicitante em um dia especifico. */
  contarPorSolicitanteNoDia(solicitanteId: string, inicioDia: Date, fimDia: Date): Promise<number> {
    return this.db.reserva.count({
      where: {
        solicitanteId,
        status: { notIn: ["CANCELADA", "REJEITADA"] },
        dataHoraInicio: { gte: inicioDia, lt: fimDia },
      },
    });
  }

  /** Reservas da sala com o status informado que tocam a janela [de, ate). */
  async listarIntervalosNaJanela(
    salaId: string,
    status: StatusReserva | StatusReserva[],
    de: Date,
    ate: Date,
    ignorarId?: string,
  ): Promise<IntervaloReservado[]> {
    const reservas = await this.db.reserva.findMany({
      where: {
        salaId,
        status: Array.isArray(status) ? { in: [...status] } : status,
        dataHoraInicio: { lt: ate },
        dataHoraFim: { gt: de },
        ...(ignorarId ? { id: { not: ignorarId } } : {}),
      },
      select: { id: true, dataHoraInicio: true, dataHoraFim: true },
    });
    return reservas.map((r) => ({ id: r.id, inicio: r.dataHoraInicio, fim: r.dataHoraFim }));
  }

  criarSerie(dados: Prisma.SerieRecorrenciaUncheckedCreateInput): Promise<SerieRecorrencia> {
    return this.db.serieRecorrencia.create({ data: dados });
  }

  criar(dados: Prisma.ReservaUncheckedCreateInput): Promise<Reserva> {
    return this.db.reserva.create({ data: dados });
  }

  async criarVarias(dados: Prisma.ReservaCreateManyInput[]): Promise<number> {
    const { count } = await this.db.reserva.createMany({ data: dados });
    return count;
  }

  listarPorSerie(serieRecorrenciaId: string): Promise<Reserva[]> {
    return this.db.reserva.findMany({
      where: { serieRecorrenciaId },
      orderBy: { dataHoraInicio: "asc" },
    });
  }

  /**
   * Atualizacao condicional (compare-and-set): so altera se o status ainda for o esperado.
   * Retorna false se outra operacao alterou a reserva antes.
   */
  async atualizarSeStatus(
    id: string,
    statusEsperado: StatusReserva,
    dados: Prisma.ReservaUncheckedUpdateManyInput,
  ): Promise<boolean> {
    const { count } = await this.db.reserva.updateMany({
      where: { id, status: statusEsperado },
      data: dados,
    });
    return count === 1;
  }

  /** Busca reserva com dados do solicitante e responsavel para fluxo de cancelamento e aprovacao. */
  async buscarParaCancelamento(id: string): Promise<ReservaParaCancelamento | null> {
    const reserva = await this.db.reserva.findUnique({
      where: { id },
      include: {
        sala: { select: { predioId: true, predio: { select: { setorId: true } } } },
        solicitante: {
          select: {
            id: true,
            tipoCredencial: true,
            nivelAcesso: true,
            lotacoesCoordenacao: { where: { ativo: true }, select: { id: true } },
          },
        },
        responsavel: {
          select: {
            id: true,
            tipoCredencial: true,
            nivelAcesso: true,
            departamentoId: true,
            lotacoesCoordenacao: { where: { ativo: true }, select: { id: true } },
          },
        },
      },
    });
    if (!reserva) return null;
    const { sala, solicitante, responsavel, ...dados } = reserva as typeof reserva & {
      solicitante: {
        id: string;
        tipoCredencial: TipoCredencial;
        nivelAcesso?: number;
        lotacoesCoordenacao?: Array<{ id: string }>;
      };
      responsavel?: {
        id: string;
        tipoCredencial: TipoCredencial;
        nivelAcesso?: number;
        departamentoId?: string | null;
        lotacoesCoordenacao?: Array<{ id: string }>;
      } | null;
    };
    return {
      ...dados,
      predioId: sala.predioId,
      setorId: sala.predio.setorId,
      solicitanteTipo: solicitante.tipoCredencial,
      solicitanteEhCoordenador:
        solicitante.nivelAcesso === 4 || (solicitante.lotacoesCoordenacao?.length ?? 0) > 0,
      responsavelEhCoordenador:
        responsavel?.nivelAcesso === 4 || (responsavel?.lotacoesCoordenacao?.length ?? 0) > 0,
      responsavelDepartamentoId: responsavel?.departamentoId ?? null,
    };
  }
}

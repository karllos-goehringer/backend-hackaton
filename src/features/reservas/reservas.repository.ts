import type { Prisma, Reserva, SerieRecorrencia, StatusReserva } from "@prisma/client";
import type { DbClient } from "../../shared/database/transacao.js";

export interface ReservaComLocalizacao extends Reserva {
  predioId: string;
  setorId: string;
}

export interface IntervaloReservado {
  id: string;
  inicio: Date;
  fim: Date;
}

/** Acesso a dados de reservas. Sem regras de negocio: apenas consultas e escritas parametrizadas. */
export class ReservasRepository {
  constructor(private readonly db: DbClient) {}

  buscarPorId(id: string): Promise<Reserva | null> {
    return this.db.reserva.findUnique({ where: { id } });
  }

  async buscarComLocalizacao(id: string): Promise<ReservaComLocalizacao | null> {
    const reserva = await this.db.reserva.findUnique({
      where: { id },
      include: { sala: { select: { predioId: true, predio: { select: { setorId: true } } } } },
    });
    if (!reserva) return null;
    const { sala, ...dados } = reserva;
    return { ...dados, predioId: sala.predioId, setorId: sala.predio.setorId };
  }

  contarPorSolicitanteEStatusDesde(solicitanteId: string, status: StatusReserva, desde: Date): Promise<number> {
    return this.db.reserva.count({
      where: { solicitanteId, status, criadoEm: { gte: desde } },
    });
  }

  /** Reservas da sala com o status informado que tocam a janela [de, ate). */
  async listarIntervalosNaJanela(
    salaId: string,
    status: StatusReserva,
    de: Date,
    ate: Date,
    ignorarId?: string,
  ): Promise<IntervaloReservado[]> {
    const reservas = await this.db.reserva.findMany({
      where: {
        salaId,
        status,
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
}

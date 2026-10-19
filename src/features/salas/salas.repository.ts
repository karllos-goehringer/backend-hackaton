import type { DbClient } from "../../shared/database/transacao.js";

/** Localizacao territorial de uma sala, usada no escopo de coordenacao. */
export interface LocalizacaoSala {
  predioId: string;
  setorId: string;
}

export interface SalaParaReserva extends LocalizacaoSala {
  id: string;
  codigo: string;
  ativa: boolean;
}

export class SalasRepository {
  constructor(private readonly db: DbClient) {}

  async buscarParaReserva(id: string): Promise<SalaParaReserva | null> {
    const sala = await this.db.sala.findUnique({
      where: { id },
      select: { id: true, codigo: true, ativa: true, predioId: true, predio: { select: { setorId: true } } },
    });
    if (!sala) return null;
    return {
      id: sala.id,
      codigo: sala.codigo,
      ativa: sala.ativa,
      predioId: sala.predioId,
      setorId: sala.predio.setorId,
    };
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


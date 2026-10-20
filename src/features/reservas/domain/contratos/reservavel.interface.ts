import type { Reserva } from "@prisma/client";

/**
 * Interface IReservavel (Passo 3 do plano de acao).
 * Contrato para servicos ou processadores de agendamento de reservas.
 */
export interface IReservavel {
  reservar(reserva: Reserva): Promise<void> | void;
}


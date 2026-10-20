import type { Reserva } from "@prisma/client";

/**
 * Interface ICancelavel (Passo 3 do plano de acao).
 * Contrato para servicos de cancelamento de reservas.
 */
export interface ICancelavel {
  cancelarReserva(reserva: Reserva, canceladorId: string, justificativa: string): Promise<void> | void;
}


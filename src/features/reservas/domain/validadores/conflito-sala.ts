import { ConflictError } from "../../../../shared/errors/app-error.js";
import type { IntervaloReservado } from "../../reservas.repository.js";
import { sobrepoe, type Ocorrencia } from "../reserva.types.js";

/** Janela minima [menor inicio, maior fim) que contem todas as ocorrencias. */
export function janelaDasOcorrencias(ocorrencias: readonly Ocorrencia[]): Ocorrencia {
  let inicio = ocorrencias[0].inicio;
  let fim = ocorrencias[0].fim;
  for (const o of ocorrencias) {
    if (o.inicio < inicio) inicio = o.inicio;
    if (o.fim > fim) fim = o.fim;
  }
  return { inicio, fim };
}

/**
 * Regra anti double-booking: nenhuma ocorrencia pode se sobrepor a uma reserva APROVADA da mesma sala.
 * Lanca ConflictError listando as ocorrencias conflitantes.
 */
export function garantirSemConflito(ocorrencias: readonly Ocorrencia[], aprovadas: readonly IntervaloReservado[]): void {
  const conflitos = ocorrencias.flatMap((ocorrencia) =>
    aprovadas
      .filter((reservada) => sobrepoe(ocorrencia, reservada))
      .map((reservada) => ({
        inicio: ocorrencia.inicio.toISOString(),
        fim: ocorrencia.fim.toISOString(),
        reservaConflitanteId: reservada.id,
      })),
  );

  if (conflitos.length > 0) {
    throw new ConflictError("A sala ja possui reserva aprovada no horario solicitado.", { conflitos });
  }
}


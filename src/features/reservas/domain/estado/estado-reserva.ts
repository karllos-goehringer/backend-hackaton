import { StatusReserva } from "@prisma/client";
import { ConflictError } from "../../../../shared/errors/app-error.js";

/**
 * State Pattern: cada status sabe quais transicoes sao legais e qual e o proximo status.
 *
 *   PENDENTE_APROVACAO -> APROVADA | REJEITADA | CANCELADA
 *   APROVADA           -> CANCELADA | CONCLUIDA
 *   REJEITADA, CANCELADA, CONCLUIDA -> (terminais)
 */
export interface EstadoReserva {
  readonly status: StatusReserva;
  aprovar(): StatusReserva;
  rejeitar(): StatusReserva;
  cancelar(): StatusReserva;
  concluir(): StatusReserva;
}

abstract class EstadoReservaBase implements EstadoReserva {
  abstract readonly status: StatusReserva;

  aprovar(): StatusReserva {
    return this.negar("aprovar");
  }

  rejeitar(): StatusReserva {
    return this.negar("rejeitar");
  }

  cancelar(): StatusReserva {
    return this.negar("cancelar");
  }

  concluir(): StatusReserva {
    return this.negar("concluir");
  }

  protected negar(acao: string): never {
    throw new ConflictError(`Nao e possivel ${acao} uma reserva com status ${this.status}.`);
  }
}

class EstadoPendenteAprovacao extends EstadoReservaBase {
  readonly status = StatusReserva.PENDENTE_APROVACAO;

  override aprovar(): StatusReserva {
    return StatusReserva.APROVADA;
  }

  override rejeitar(): StatusReserva {
    return StatusReserva.REJEITADA;
  }

  override cancelar(): StatusReserva {
    return StatusReserva.CANCELADA;
  }
}

class EstadoAprovada extends EstadoReservaBase {
  readonly status = StatusReserva.APROVADA;

  override cancelar(): StatusReserva {
    return StatusReserva.CANCELADA;
  }

  /** Transicao prevista no dominio; o gatilho (job/endpoint) ainda nao foi definido. */
  override concluir(): StatusReserva {
    return StatusReserva.CONCLUIDA;
  }
}

class EstadoRejeitada extends EstadoReservaBase {
  readonly status = StatusReserva.REJEITADA;
}

class EstadoCancelada extends EstadoReservaBase {
  readonly status = StatusReserva.CANCELADA;
}

class EstadoConcluida extends EstadoReservaBase {
  readonly status = StatusReserva.CONCLUIDA;
}

const ESTADOS: Record<StatusReserva, EstadoReserva> = {
  [StatusReserva.PENDENTE_APROVACAO]: new EstadoPendenteAprovacao(),
  [StatusReserva.APROVADA]: new EstadoAprovada(),
  [StatusReserva.REJEITADA]: new EstadoRejeitada(),
  [StatusReserva.CANCELADA]: new EstadoCancelada(),
  [StatusReserva.CONCLUIDA]: new EstadoConcluida(),
};

export function estadoDaReserva(status: StatusReserva): EstadoReserva {
  return ESTADOS[status];
}


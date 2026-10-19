import { StatusReserva } from "../enums/statusReserva.js";

export interface ReservaProps {
  id?: string;
  solicitanteId: string;
  salaId: string;
  aprovadoPorId?: string | null;
  inicio: Date;
  fim: Date;
  finalidade: string;
  status?: StatusReserva;
  criadoEm?: Date;
  aprovadoEm?: Date | null;
}

export class Reserva {
  readonly id?: string;
  readonly solicitanteId: string;
  readonly salaId: string;
  readonly aprovadoPorId: string | null;
  readonly inicio: Date;
  readonly fim: Date;
  readonly finalidade: string;
  readonly status: StatusReserva;
  readonly criadoEm: Date;
  readonly aprovadoEm: Date | null;

  constructor(props: ReservaProps) {
    this.id = props.id;
    this.solicitanteId = props.solicitanteId;
    this.salaId = props.salaId;
    this.aprovadoPorId = props.aprovadoPorId ?? null;
    this.inicio = props.inicio;
    this.fim = props.fim;
    this.finalidade = props.finalidade;
    this.status = props.status ?? StatusReserva.PENDENTE;
    this.criadoEm = props.criadoEm ?? new Date();
    this.aprovadoEm = props.aprovadoEm ?? null;
  }
}

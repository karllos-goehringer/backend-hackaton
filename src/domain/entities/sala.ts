import { TipoSala } from "../enums/tipoSala.js";

export interface SalaProps {
  id?: string;
  predioId: string;
  numSala: number;
  nomeSala: string;
  andar: number;
  capacidade: number;
  tipo: TipoSala;
  ativa?: boolean;
  recursoIds?: string[];
  reservaIds?: string[];
}

export class Sala {
  readonly id?: string;
  readonly predioId: string;
  readonly numSala: number;
  readonly nomeSala: string;
  readonly andar: number;
  readonly capacidade: number;
  readonly tipo: TipoSala;
  readonly ativa: boolean;
  readonly recursoIds: readonly string[];
  readonly reservaIds: readonly string[];

  constructor(props: SalaProps) {
    this.id = props.id;
    this.predioId = props.predioId;
    this.numSala = props.numSala;
    this.nomeSala = props.nomeSala;
    this.andar = props.andar;
    this.capacidade = props.capacidade;
    this.tipo = props.tipo;
    this.ativa = props.ativa ?? true;
    this.recursoIds = [...(props.recursoIds ?? [])];
    this.reservaIds = [...(props.reservaIds ?? [])];
  }
}

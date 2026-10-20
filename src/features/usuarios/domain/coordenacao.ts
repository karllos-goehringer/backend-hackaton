export interface CoordenacaoProps {
  id?: string;
  coordenadorId: string;
  departamentoId: string;
  predioId: string;
  setorId?: string | null;
  numeroPortaria: string;
  ativa?: boolean;
}

/** Lotação ativa que concede ao professor poderes de coordenação no escopo indicado. */
export class Coordenacao {
  readonly id?: string;
  readonly coordenadorId: string;
  readonly departamentoId: string;
  readonly predioId: string;
  readonly setorId: string | null;
  readonly numeroPortaria: string;
  readonly ativa: boolean;

  constructor(props: CoordenacaoProps) {
    this.id = props.id;
    this.coordenadorId = props.coordenadorId;
    this.departamentoId = props.departamentoId;
    this.predioId = props.predioId;
    this.setorId = props.setorId ?? null;
    this.numeroPortaria = props.numeroPortaria;
    this.ativa = props.ativa ?? true;
  }
}

export interface CoordenacaoProps {
  id?: string;
  coordenadorId: string;
  departamentoId: string;
  predioId: string;
  setorId?: string | null;
  numeroPortaria: string;
  dataInicio: Date;
  dataFim?: Date | null;
  ativa?: boolean;
}

/** Lotação temporária que concede ao professor poderes de coordenação no escopo indicado. */
export class Coordenacao {
  readonly id?: string;
  readonly coordenadorId: string;
  readonly departamentoId: string;
  readonly predioId: string;
  readonly setorId: string | null;
  readonly numeroPortaria: string;
  readonly dataInicio: Date;
  readonly dataFim: Date | null;
  readonly ativa: boolean;

  constructor(props: CoordenacaoProps) {
    if (props.dataFim && props.dataFim < props.dataInicio) {
      throw new RangeError("A data final da coordenacao nao pode anteceder a inicial.");
    }
    this.id = props.id;
    this.coordenadorId = props.coordenadorId;
    this.departamentoId = props.departamentoId;
    this.predioId = props.predioId;
    this.setorId = props.setorId ?? null;
    this.numeroPortaria = props.numeroPortaria;
    this.dataInicio = props.dataInicio;
    this.dataFim = props.dataFim ?? null;
    this.ativa = props.ativa ?? true;
  }
}

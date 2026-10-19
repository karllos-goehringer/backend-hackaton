export interface RecursoProps {
  id?: string;
  descricao: string;
  salaIds?: string[];
}

export class Recurso {
  readonly id?: string;
  readonly descricao: string;
  readonly salaIds: readonly string[];

  constructor(props: RecursoProps) {
    this.id = props.id;
    this.descricao = props.descricao;
    this.salaIds = [...(props.salaIds ?? [])];
  }
}

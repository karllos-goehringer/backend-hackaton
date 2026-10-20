export interface DepartamentoProps {
  id: string;
  nome: string;
}

export class Departamento {
  readonly id: string;
  readonly nome: string;

  constructor(props: DepartamentoProps) {
    this.id = props.id;
    this.nome = props.nome;
  }
}

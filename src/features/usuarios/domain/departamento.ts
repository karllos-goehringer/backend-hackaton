export interface DepartamentoProps {
  id: string;
  setorId: string;
  nome: string;
}

export class Departamento {
  readonly id: string;
  readonly setorId: string;
  readonly nome: string;

  constructor(props: DepartamentoProps) {
    this.id = props.id;
    this.setorId = props.setorId;
    this.nome = props.nome;
  }
}

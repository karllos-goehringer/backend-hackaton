import { Endereco, type EnderecoProps } from "./endereco.js";

export interface PredioProps {
  id?: string;
  nome: string;
  endereco: Endereco | EnderecoProps;
  salaIds?: string[];
}

export class Predio {
  readonly id?: string;
  readonly nome: string;
  readonly endereco: Endereco;
  readonly salaIds: readonly string[];

  constructor(props: PredioProps) {
    this.id = props.id;
    this.nome = props.nome;
    this.endereco = props.endereco instanceof Endereco
      ? props.endereco
      : new Endereco(props.endereco);
    this.salaIds = [...(props.salaIds ?? [])];
  }
}

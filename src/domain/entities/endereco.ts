export interface EnderecoProps {
  rua: string;
  numero: number;
  bairro: string;
  cep: string;
}

export class Endereco {
  readonly rua: string;
  readonly numero: number;
  readonly bairro: string;
  readonly cep: string;

  constructor(props: EnderecoProps) {
    this.rua = props.rua;
    this.numero = props.numero;
    this.bairro = props.bairro;
    this.cep = props.cep;
  }
}

import { Perfil } from "../enums/perfil.js";

export interface UsuarioProps {
  id?: string;
  nome: string;
  email: string;
  senhaHash: string;
  siape: string;
  departamento: string;
  criadoEm?: Date;
}

export class Usuario {
  readonly id?: string;
  readonly nome: string;
  readonly email: string;
  readonly senhaHash: string;
  readonly siape: string;
  readonly departamento: string;
  readonly criadoEm: Date;
  readonly perfil: Perfil;

  constructor(props: UsuarioProps, perfil: Perfil) {
    this.id = props.id;
    this.nome = props.nome;
    this.email = props.email;
    this.senhaHash = props.senhaHash;
    this.siape = props.siape;
    this.departamento = props.departamento;
    this.criadoEm = props.criadoEm ?? new Date();
    this.perfil = perfil;
  }
}

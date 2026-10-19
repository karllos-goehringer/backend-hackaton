import { NivelAcesso } from "../nivel-acesso.js";

export interface UsuarioProps {
  uuid: string;
  email: string;
  telefone: string | null;
  nivelAcesso: NivelAcesso;
}

export class Usuario {
  readonly uuid: string;
  readonly email: string;
  readonly telefone: string | null;
  readonly nivelAcesso: NivelAcesso;

  constructor(props: UsuarioProps) {
    this.uuid = props.uuid;
    this.email = props.email;
    this.telefone = props.telefone;
    this.nivelAcesso = props.nivelAcesso;
  }
}

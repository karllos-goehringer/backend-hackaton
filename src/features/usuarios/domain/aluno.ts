import { NivelAcesso } from "../nivel-acesso.js";
import { Usuario, type UsuarioProps } from "./usuario.js";

export interface AlunoProps extends Omit<UsuarioProps, "nivelAcesso"> {
  matricula: number | string;
}

export class Aluno extends Usuario {
  readonly matricula: number | string;

  constructor(props: AlunoProps) {
    super({ ...props, nivelAcesso: NivelAcesso.ALUNO });
    this.matricula = props.matricula;
  }
}

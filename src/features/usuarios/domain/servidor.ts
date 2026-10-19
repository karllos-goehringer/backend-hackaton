import { NivelAcesso } from "../nivel-acesso.js";
import { Usuario, type UsuarioProps } from "./usuario.js";

export interface ServidorProps extends Omit<UsuarioProps, "nivelAcesso"> {
  departamentoId: string;
  siape: number;
  nivelAcesso: NivelAcesso.PROFESSOR | NivelAcesso.COORDENADOR | NivelAcesso.TECNICO;
}

export class Servidor extends Usuario {
  readonly departamentoId: string;
  readonly siape: number;

  constructor(props: ServidorProps) {
    super(props);
    this.departamentoId = props.departamentoId;
    this.siape = props.siape;
  }
}

import { Perfil } from "../enums/perfil.js";
import { Usuario, type UsuarioProps } from "./usuario.js";

export interface CoordenadorProps extends UsuarioProps {
  cursoCoordenado: string;
}

export class Coordenador extends Usuario {
  readonly cursoCoordenado: string;

  constructor(props: CoordenadorProps) {
    super(props, Perfil.COORDENADOR);
    this.cursoCoordenado = props.cursoCoordenado;
  }
}

import { Perfil } from "../enums/perfil.js";
import { Usuario, type UsuarioProps } from "./usuario.js";

export class Professor extends Usuario {
  constructor(props: UsuarioProps) {
    super(props, Perfil.PROFESSOR);
  }
}

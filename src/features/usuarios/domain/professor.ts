import { NivelAcesso } from "../nivel-acesso.js";
import { Servidor, type ServidorProps } from "./servidor.js";

export type ProfessorProps = Omit<ServidorProps, "nivelAcesso">;

export class Professor extends Servidor {
  constructor(props: ProfessorProps) {
    super({ ...props, nivelAcesso: NivelAcesso.PROFESSOR });
  }
}

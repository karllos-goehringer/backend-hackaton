import { NivelAcesso } from "../nivel-acesso.js";
import { Servidor, type ServidorProps } from "./servidor.js";

export type TecnicoProps = Omit<ServidorProps, "nivelAcesso">;

export class Tecnico extends Servidor {
  constructor(props: TecnicoProps) {
    super({ ...props, nivelAcesso: NivelAcesso.TECNICO });
  }
}

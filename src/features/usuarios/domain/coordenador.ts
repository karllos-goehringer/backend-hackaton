import { NivelAcesso } from "../nivel-acesso.js";
import { Professor, type ProfessorProps } from "./professor.js";

export type CoordenadorProps = ProfessorProps;

/** Papel atribuído a um Professor enquanto houver lotação de coordenação vigente. */
export class Coordenador extends Professor {
  readonly nivelAcesso = NivelAcesso.COORDENADOR;

  constructor(props: CoordenadorProps) {
    super(props);
  }
}

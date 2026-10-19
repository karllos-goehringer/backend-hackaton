import { TipoCredencial } from "@prisma/client";
import type { EscopoCoordenacaoService } from "../../../coordenacao/escopo-coordenacao.service.js";
import type { LocalizacaoSala } from "../../../salas/salas.repository.js";
import {
  PoliticaAlunoStrategy,
  PoliticaCoordenadorStrategy,
  PoliticaProfessorStrategy,
  PoliticaTecnicoStrategy,
  type PoliticaReservaStrategy,
} from "./politica-reserva.strategy.js";

export interface AtorReserva {
  id: string;
  tipoCredencial: TipoCredencial;
}

/**
 * Contexto do Strategy + Role Object: escolhe a politica conforme o papel ativo do ator sobre a sala.
 * - Aluno (MATRICULA_ALUNO)                          -> PoliticaAlunoStrategy
 * - Tecnico (SIAPE_TECNICO)                          -> PoliticaTecnicoStrategy
 * - Docente com lotacao vigente no Predio/Setor      -> PoliticaCoordenadorStrategy
 * - Docente sem lotacao vigente sobre a sala         -> PoliticaProfessorStrategy
 */
export class ResolvedorPoliticaReserva {
  private readonly aluno = new PoliticaAlunoStrategy();
  private readonly tecnico = new PoliticaTecnicoStrategy();
  private readonly professor = new PoliticaProfessorStrategy();
  private readonly coordenador = new PoliticaCoordenadorStrategy();

  constructor(private readonly escopo: EscopoCoordenacaoService) {}

  async resolver(ator: AtorReserva, sala: LocalizacaoSala, agora: Date): Promise<PoliticaReservaStrategy> {
    if (ator.tipoCredencial === TipoCredencial.MATRICULA_ALUNO) return this.aluno;
    if (ator.tipoCredencial === TipoCredencial.SIAPE_TECNICO) return this.tecnico;
    const coordena = await this.escopo.coordenaSala(ator.id, sala, agora);
    return coordena ? this.coordenador : this.professor;
  }
}


import { TipoCredencial } from "@prisma/client";
import type { EscopoCoordenacaoService } from "../../../coordenacao/escopo-coordenacao.service.js";
import type { LocalizacaoSala } from "../../../salas/salas.repository.js";
import { NivelAcesso } from "../nivel-acesso.js";
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
  nivelAcesso?: NivelAcesso | number;
  departamentoId?: string | null;
}

/**
 * Contexto do Strategy + Role Object: escolhe a politica conforme o papel do ator.
 * Coordenadores nao possuem separacao de hierarquia por predio/predios.
 * - Coordenador (nivelAcesso = COORDENADOR ou lotacao ativa) -> PoliticaCoordenadorStrategy
 * - Aluno (MATRICULA_ALUNO)                                  -> PoliticaAlunoStrategy
 * - Tecnico (SIAPE_TECNICO)                                  -> PoliticaTecnicoStrategy
 * - Docente (SIAPE_DOCENTE)                                  -> PoliticaProfessorStrategy
 */
export class ResolvedorPoliticaReserva {
  private readonly aluno = new PoliticaAlunoStrategy();
  private readonly tecnico = new PoliticaTecnicoStrategy();
  private readonly professor = new PoliticaProfessorStrategy();
  private readonly coordenador = new PoliticaCoordenadorStrategy();

  constructor(private readonly escopo?: EscopoCoordenacaoService) {}

  async resolver(ator: AtorReserva, _sala?: LocalizacaoSala): Promise<PoliticaReservaStrategy> {
    if (ator.nivelAcesso === NivelAcesso.COORDENADOR || ator.nivelAcesso === 4) {
      return this.coordenador;
    }
    if (ator.tipoCredencial === TipoCredencial.MATRICULA_ALUNO) return this.aluno;
    if (ator.tipoCredencial === TipoCredencial.SIAPE_TECNICO) return this.tecnico;
    if (this.escopo) {
      const coordena = await this.escopo.ehCoordenadorAtivo(ator.id);
      if (coordena) return this.coordenador;
    }
    return this.professor;
  }
}

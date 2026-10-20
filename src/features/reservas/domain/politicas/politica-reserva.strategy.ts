import { StatusReserva } from "@prisma/client";
import { ForbiddenError } from "../../../../shared/errors/app-error.js";
import { NivelAcesso } from "../nivel-acesso.js";

/** Dados da reserva relevantes para decisoes de permissao. */
export interface ReservaParaPermissao {
  solicitanteId: string;
  responsavelId: string;
  dataHoraInicio: Date;
}

/** Caracteristicas do pedido que dependem do papel do solicitante. */
export interface IntencaoCriacao {
  recorrente: boolean;
  delegada: boolean; // responsavel != solicitante
}

/**
 * Strategy Pattern: regras que variam conforme o papel ATIVO do usuario sobre a sala.
 */
export interface PoliticaReservaStrategy {
  readonly nivel: NivelAcesso;
  /** Sujeita o solicitante aos limites de Aluno/Tecnico (antecedencia de 12h e ate 2 reservas/12h e por dia). */
  readonly exigeQuota12Horas: boolean;
  readonly exigeQuotaPendente12Horas: boolean;
  /** Lanca ForbiddenError se o papel nao permite recorrencia ou delegacao. */
  validarCriacao(intencao: IntencaoCriacao): void;
  definirStatusInicial(): StatusReserva;
  podeCancelar(atorId: string, reserva: ReservaParaPermissao, agora: Date): boolean;
  podeAprovarOuRejeitar(): boolean;
}

/** Base para Aluno, Professor e Tecnico: sem recorrencia, sem delegacao livre, cancelam as proprias antes do inicio. */
abstract class PoliticaSemPrivilegios implements PoliticaReservaStrategy {
  abstract readonly nivel: NivelAcesso;
  abstract readonly exigeQuota12Horas: boolean;
  abstract readonly exigeQuotaPendente12Horas: boolean;
  protected abstract readonly rotulo: string;

  validarCriacao({ recorrente, delegada }: IntencaoCriacao): void {
    if (recorrente) {
      throw new ForbiddenError(`${this.rotulo} nao podem criar reservas recorrentes.`);
    }
    if (delegada) {
      throw new ForbiddenError(`${this.rotulo} nao podem delegar a responsabilidade da reserva.`);
    }
  }

  definirStatusInicial(): StatusReserva {
    return StatusReserva.PENDENTE_APROVACAO;
  }

  podeCancelar(atorId: string, reserva: ReservaParaPermissao, agora: Date): boolean {
    const propria = reserva.solicitanteId === atorId;
    return propria && agora.getTime() < reserva.dataHoraInicio.getTime();
  }

  podeAprovarOuRejeitar(): boolean {
    return false;
  }
}

export class PoliticaAlunoStrategy extends PoliticaSemPrivilegios {
  readonly nivel = NivelAcesso.ALUNO;
  readonly exigeQuota12Horas = true;
  readonly exigeQuotaPendente12Horas = true;
  protected readonly rotulo = "Alunos";

  override validarCriacao({ recorrente, delegada }: IntencaoCriacao): void {
    if (recorrente) {
      throw new ForbiddenError("Alunos nao podem criar reservas recorrentes.");
    }
    if (!delegada) {
      throw new ForbiddenError("Alunos devem obrigatoriamente indicar um responsavel (Servidor ou Coordenacao).");
    }
  }
}

export class PoliticaProfessorStrategy extends PoliticaSemPrivilegios {
  readonly nivel = NivelAcesso.PROFESSOR;
  readonly exigeQuota12Horas = false;
  readonly exigeQuotaPendente12Horas = false;
  protected readonly rotulo = "Professores";

  override definirStatusInicial(): StatusReserva {
    return StatusReserva.AGENDADO;
  }
}

export class PoliticaTecnicoStrategy extends PoliticaSemPrivilegios {
  readonly nivel = NivelAcesso.TECNICO;
  readonly exigeQuota12Horas = true;
  readonly exigeQuotaPendente12Horas = false;
  protected readonly rotulo = "Tecnicos";

  override validarCriacao({ recorrente, delegada }: IntencaoCriacao): void {
    if (recorrente) throw new ForbiddenError("Tecnicos nao podem criar reservas recorrentes.");
    if (delegada) throw new ForbiddenError("Tecnicos nao podem delegar a responsabilidade da reserva.");
  }

  override definirStatusInicial(): StatusReserva {
    return StatusReserva.AGENDADO;
  }
}

/** Aplicada para usuarios com perfil de Coordenador (escopo institucional, sem separacao por predio). */
export class PoliticaCoordenadorStrategy implements PoliticaReservaStrategy {
  readonly nivel = NivelAcesso.COORDENADOR;
  readonly exigeQuota12Horas = false;
  readonly exigeQuotaPendente12Horas = false;

  validarCriacao(): void {
    // Recorrencia e delegacao permitidas.
  }

  definirStatusInicial(): StatusReserva {
    return StatusReserva.APROVADA;
  }

  podeCancelar(_atorId: string, reserva: ReservaParaPermissao, agora: Date): boolean {
    return agora.getTime() < reserva.dataHoraInicio.getTime();
  }

  podeAprovarOuRejeitar(): boolean {
    return true;
  }
}

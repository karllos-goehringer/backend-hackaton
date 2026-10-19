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
 * Strategy Pattern: regras que variam conforme o papel ATIVO do usuario sobre a sala
 * (IPoliticaReservaStrategy + IPoliticaCancelamentoStrategy do documento).
 */
export interface PoliticaReservaStrategy {
  readonly nivel: NivelAcesso;
  /** Sujeita o solicitante ao limite de 1 reserva pendente a cada 12 horas. */
  readonly exigeQuota12Horas: boolean;
  /** Lanca ForbiddenError se o papel nao permite recorrencia ou delegacao. */
  validarCriacao(intencao: IntencaoCriacao): void;
  definirStatusInicial(): StatusReserva;
  podeCancelar(atorId: string, reserva: ReservaParaPermissao, agora: Date): boolean;
  podeAprovarOuRejeitar(): boolean;
}

/** Base para Aluno e Professor: sem recorrencia, sem delegacao, cancelam apenas as proprias antes do inicio. */
abstract class PoliticaSemPrivilegios implements PoliticaReservaStrategy {
  abstract readonly nivel: NivelAcesso;
  abstract readonly exigeQuota12Horas: boolean;
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
    const propria = reserva.solicitanteId === atorId || reserva.responsavelId === atorId;
    return propria && agora.getTime() < reserva.dataHoraInicio.getTime();
  }

  podeAprovarOuRejeitar(): boolean {
    return false;
  }
}

export class PoliticaAlunoStrategy extends PoliticaSemPrivilegios {
  readonly nivel = NivelAcesso.ALUNO;
  readonly exigeQuota12Horas = true;
  protected readonly rotulo = "Alunos";
}

export class PoliticaProfessorStrategy extends PoliticaSemPrivilegios {
  readonly nivel = NivelAcesso.PROFESSOR;
  readonly exigeQuota12Horas = false;
  protected readonly rotulo = "Professores";
}

/** Aplicada somente quando o docente tem lotacao vigente sobre o Predio/Setor da sala. */
export class PoliticaCoordenadorStrategy implements PoliticaReservaStrategy {
  readonly nivel = NivelAcesso.COORDENADOR;
  readonly exigeQuota12Horas = false;

  validarCriacao(): void {
    // Recorrencia e delegacao permitidas.
  }

  definirStatusInicial(): StatusReserva {
    return StatusReserva.APROVADA;
  }

  podeCancelar(): boolean {
    return true;
  }

  podeAprovarOuRejeitar(): boolean {
    return true;
  }
}


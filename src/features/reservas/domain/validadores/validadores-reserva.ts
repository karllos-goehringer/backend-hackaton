import { StatusReserva, TipoCredencial } from "@prisma/client";
import { BusinessRuleError } from "../../../../shared/errors/app-error.js";
import { partesLocais } from "../../../../shared/utils/data-hora.js";
import type { SalaParaReserva } from "../../../salas/salas.repository.js";
import type { UsuariosRepository } from "../../../usuarios/usuarios.repository.js";
import type { JanelaFuncionamento } from "../../reservas.config.js";
import type { ReservasRepository } from "../../reservas.repository.js";
import type { PoliticaReservaStrategy } from "../politicas/politica-reserva.strategy.js";
import type { AtorReserva } from "../politicas/resolvedor-politica.js";
import type { Ocorrencia } from "../reserva.types.js";
import { garantirSemConflito, janelaDasOcorrencias } from "./conflito-sala.js";

export interface ContextoValidacaoReserva {
  ator: AtorReserva;
  politica: PoliticaReservaStrategy;
  sala: SalaParaReserva;
  responsavelId: string;
  ocorrencias: Ocorrencia[];
  agora: Date;
  /** Repositories ligados a transacao corrente. */
  reservas: ReservasRepository;
  usuarios: UsuariosRepository;
}

/** Chain of Responsibility: cada elo valida um aspecto e delega ao proximo. */
export abstract class ValidadorReserva {
  private proximo?: ValidadorReserva;

  encadear(proximo: ValidadorReserva): ValidadorReserva {
    this.proximo = proximo;
    return proximo;
  }

  async validar(contexto: ContextoValidacaoReserva): Promise<void> {
    await this.executar(contexto);
    await this.proximo?.validar(contexto);
  }

  protected abstract executar(contexto: ContextoValidacaoReserva): Promise<void>;
}

/** Coerencia dos intervalos e, se configurada, a janela de funcionamento no fuso institucional. */
export class ValidadorHorarioFuncionamento extends ValidadorReserva {
  constructor(private readonly janela: JanelaFuncionamento | null) {
    super();
  }

  protected async executar({ ocorrencias, agora }: ContextoValidacaoReserva): Promise<void> {
    for (const { inicio, fim } of ocorrencias) {
      if (fim.getTime() <= inicio.getTime()) {
        throw new BusinessRuleError("O horario de termino deve ser posterior ao de inicio.");
      }
      if (inicio.getTime() <= agora.getTime()) {
        throw new BusinessRuleError("Nao e possivel reservar um horario que ja comecou.", {
          inicio: inicio.toISOString(),
        });
      }
      if (this.janela) this.validarJanela(inicio, fim, this.janela);
    }
  }

  private validarJanela(inicio: Date, fim: Date, janela: JanelaFuncionamento): void {
    const li = partesLocais(inicio);
    const lf = partesLocais(fim);
    const mesmoDia = li.ano === lf.ano && li.mes === lf.mes && li.dia === lf.dia;
    const inicioMin = li.hora * 60 + li.minuto;
    const fimMin = lf.hora * 60 + lf.minuto + (lf.segundo > 0 || lf.milissegundo > 0 ? 1 : 0);

    if (!mesmoDia || inicioMin < janela.aberturaMinutos || fimMin > janela.fechamentoMinutos) {
      throw new BusinessRuleError("A reserva esta fora do horario de funcionamento.", {
        inicio: inicio.toISOString(),
        fim: fim.toISOString(),
      });
    }
  }
}

/** Passo 2.1: a duracao de cada turno deve ser exatamente 50 minutos. */
export class ValidadorDuracao50Minutos extends ValidadorReserva {
  static readonly DURACAO_MS = 50 * 60 * 1000;

  protected async executar({ ocorrencias }: ContextoValidacaoReserva): Promise<void> {
    for (const { inicio, fim } of ocorrencias) {
      const duracao = fim.getTime() - inicio.getTime();
      if (duracao !== ValidadorDuracao50Minutos.DURACAO_MS) {
        throw new BusinessRuleError("A duracao da reserva deve ser exatamente 50 minutos.", {
          inicio: inicio.toISOString(),
          fim: fim.toISOString(),
          duracaoMinutos: duracao / 60000,
        });
      }
    }
  }
}

/** Passo 2.7: Aluno e Tecnico devem criar reservas com no minimo 12 horas de antecedencia. */
export class ValidadorAntecedencia12Horas extends ValidadorReserva {
  static readonly ANTECEDENCIA_MS = 12 * 60 * 60 * 1000;

  protected async executar({ politica, ocorrencias, agora }: ContextoValidacaoReserva): Promise<void> {
    if (!politica.exigeQuota12Horas) return;

    for (const { inicio } of ocorrencias) {
      const antecedencia = inicio.getTime() - agora.getTime();
      if (antecedencia < ValidadorAntecedencia12Horas.ANTECEDENCIA_MS) {
        throw new BusinessRuleError(
          "Alunos e tecnicos devem criar reservas com no minimo 12 horas de antecedencia.",
          { inicio: inicio.toISOString() },
        );
      }
    }
  }
}

/**
 * Passo 2.6: Aluno e Tecnico como solicitantes podem ter no maximo 2 reservas ativas
 * simultaneamente, independentemente de quanto tempo passe, ate que a reserva seja concluida.
 */
export class ValidadorLimiteReservasAtivas extends ValidadorReserva {
  static readonly LIMITE_ATIVAS = 2;

  protected async executar({ politica, ator, ocorrencias, agora, reservas }: ContextoValidacaoReserva): Promise<void> {
    if (!politica.exigeQuota12Horas) return;

    const reservasAtivas = await this.contarReservasAtivasNaoConcluidas(reservas, ator.id, agora);

    if (reservasAtivas + ocorrencias.length > ValidadorLimiteReservasAtivas.LIMITE_ATIVAS) {
      throw new BusinessRuleError(
        `Alunos e tecnicos podem ter no maximo ${ValidadorLimiteReservasAtivas.LIMITE_ATIVAS} reservas ativas simultaneamente ate que sejam concluidas.`,
        { reservasAtivas },
      );
    }
  }

  private async contarReservasAtivasNaoConcluidas(
    reservas: ReservasRepository,
    solicitanteId: string,
    agora: Date,
  ): Promise<number> {
    const repo = reservas as ReservasRepository & {
      contarAtivasPorSolicitante?: (solicitanteId: string, agora: Date) => Promise<number>;
      contarAtivasPorSolicitanteDesde?: (solicitanteId: string, desde: Date) => Promise<number>;
    };

    if (typeof repo.contarAtivasPorSolicitante === "function") {
      return repo.contarAtivasPorSolicitante(solicitanteId, agora);
    }

    if (typeof repo.contarAtivasPorSolicitanteDesde === "function") {
      // Passa Epoca (Date(0)) caso o repositorio legado filtre por data de criacao >= desde,
      // garantindo contagem independente de quanto tempo passou desde a solicitacao.
      return repo.contarAtivasPorSolicitanteDesde(solicitanteId, new Date(0));
    }

    return reservas.contarPorSolicitanteEStatusDesde(
      solicitanteId,
      StatusReserva.PENDENTE_APROVACAO,
      new Date(0),
    );
  }
}

/** Alias mantido para compatibilidade com importacoes existentes. */
export {
  ValidadorLimiteReservasAtivas as ValidadorQuota12HorasAluno,
  ValidadorLimiteReservasAtivas as ValidadorLimiteDiarioReservas,
};

/** Passo 2.5: Aluno nunca pode ser definido como responsavel de nenhuma reserva. */
export class ValidadorResponsavelNaoAluno extends ValidadorReserva {
  protected async executar({ ator, responsavelId, usuarios }: ContextoValidacaoReserva): Promise<void> {
    const responsavel = await usuarios.buscarResumoPorId(responsavelId);
    if (responsavelId === ator.id && ator.tipoCredencial === TipoCredencial.MATRICULA_ALUNO) {
      throw new BusinessRuleError("Aluno nao pode ser responsavel por uma reserva, nem mesmo pela propria.");
    }
    if (responsavel && responsavel.tipoCredencial === TipoCredencial.MATRICULA_ALUNO) {
      throw new BusinessRuleError("Alunos nao podem ser definidos como responsaveis de reservas.");
    }
  }
}

/**
 * Delegacao: a permissao de delegar e decidida pela politica (validarCriacao); aqui se garante
 * que o responsavel designado existe e esta ativo.
 */
export class ValidadorEscopoDelegacao extends ValidadorReserva {
  protected async executar({ ator, responsavelId, usuarios }: ContextoValidacaoReserva): Promise<void> {
    if (responsavelId === ator.id) return;

    const responsavel = await usuarios.buscarResumoPorId(responsavelId);
    if (!responsavel) {
      throw new BusinessRuleError("O responsavel designado nao existe.");
    }
    if (!responsavel.ativo) {
      throw new BusinessRuleError("O responsavel designado esta inativo.");
    }
  }
}

/** Nenhuma ocorrencia pode se sobrepor a reservas APROVADAS da sala (pendentes podem coexistir). */
export class ValidadorConflitoSala extends ValidadorReserva {
  protected async executar({ sala, ocorrencias, reservas }: ContextoValidacaoReserva): Promise<void> {
    const janela = janelaDasOcorrencias(ocorrencias);
    const bloqueantes = await reservas.listarIntervalosNaJanela(
      sala.id,
      [StatusReserva.APROVADA, StatusReserva.AGENDADO],
      janela.inicio,
      janela.fim,
    );
    garantirSemConflito(ocorrencias, bloqueantes);
  }
}

/** Pipeline do documento: Horario -> Duracao50Min -> Antecedencia12h -> LimiteReservasAtivas -> ResponsavelNaoAluno -> EscopoDelegacao -> ConflitoSala. */
export function criarPipelineValidacaoReserva(janela: JanelaFuncionamento | null): ValidadorReserva {
  const inicio = new ValidadorHorarioFuncionamento(janela);
  inicio
    .encadear(new ValidadorDuracao50Minutos())
    .encadear(new ValidadorAntecedencia12Horas())
    .encadear(new ValidadorLimiteReservasAtivas())
    .encadear(new ValidadorResponsavelNaoAluno())
    .encadear(new ValidadorEscopoDelegacao())
    .encadear(new ValidadorConflitoSala());
  return inicio;
}
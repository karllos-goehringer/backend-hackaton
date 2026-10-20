import { StatusReserva, TipoCredencial } from "@prisma/client";
import { BusinessRuleError } from "../../../../shared/errors/app-error.js";
import { dataCivil, partesLocais } from "../../../../shared/utils/data-hora.js";
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

/** Passo 2.6 (por dia): Aluno e Tecnico podem ter no maximo 2 reservas agendadas para o mesmo dia civil. */
export class ValidadorLimiteDiarioReservas extends ValidadorReserva {
  static readonly LIMITE_DIARIO = 2;

  protected async executar({ politica, ator, ocorrencias, reservas }: ContextoValidacaoReserva): Promise<void> {
    if (!politica.exigeQuota12Horas) return;

    // Agrupar ocorrencias por data civil
    const diasAfetados = new Set(ocorrencias.map((o) => dataCivil(o.inicio).toISOString()));

    for (const diaIso of diasAfetados) {
      const inicioDia = new Date(diaIso);
      const fimDia = new Date(inicioDia.getTime() + 24 * 60 * 60 * 1000);
      const existentes = await reservas.contarPorSolicitanteNoDia(ator.id, inicioDia, fimDia);
      const novasNoDia = ocorrencias.filter((o) => dataCivil(o.inicio).toISOString() === diaIso).length;
      if (existentes + novasNoDia > ValidadorLimiteDiarioReservas.LIMITE_DIARIO) {
        throw new BusinessRuleError(
          `Alunos e tecnicos podem ter no maximo ${ValidadorLimiteDiarioReservas.LIMITE_DIARIO} reservas por dia.`,
          { dia: diaIso, reservasExistentes: existentes },
        );
      }
    }
  }
}

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
 * Passo 2.6 (janela de 12h, independente do dia marcado):
 * Aluno e Tecnico podem solicitar no maximo 2 reservas ativas a cada janela movel de 12 horas.
 */
export class ValidadorQuota12HorasAluno extends ValidadorReserva {
  static readonly JANELA_MS = 12 * 60 * 60 * 1000;
  static readonly LIMITE_JANELA_12H = 2;

  protected async executar({ politica, ator, ocorrencias, agora, reservas }: ContextoValidacaoReserva): Promise<void> {
    if (!politica.exigeQuota12Horas) return;

    const desde = new Date(agora.getTime() - ValidadorQuota12HorasAluno.JANELA_MS);

    const criadasNaJanela =
      typeof reservas.contarAtivasPorSolicitanteDesde === "function"
        ? await reservas.contarAtivasPorSolicitanteDesde(ator.id, desde)
        : await reservas.contarPorSolicitanteEStatusDesde(ator.id, StatusReserva.PENDENTE_APROVACAO, desde);

    if (criadasNaJanela + ocorrencias.length > ValidadorQuota12HorasAluno.LIMITE_JANELA_12H) {
      throw new BusinessRuleError(
        `Alunos e tecnicos podem solicitar no maximo ${ValidadorQuota12HorasAluno.LIMITE_JANELA_12H} reservas a cada 12 horas.`,
        { reservasNasUltimas12h: criadasNaJanela },
      );
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

/** Pipeline do documento: Horario -> Duracao50Min -> Antecedencia12h -> LimiteDiario -> Quota12hAluno -> ResponsavelNaoAluno -> EscopoDelegacao -> ConflitoSala. */
export function criarPipelineValidacaoReserva(janela: JanelaFuncionamento | null): ValidadorReserva {
  const inicio = new ValidadorHorarioFuncionamento(janela);
  inicio
    .encadear(new ValidadorDuracao50Minutos())
    .encadear(new ValidadorAntecedencia12Horas())
    .encadear(new ValidadorLimiteDiarioReservas())
    .encadear(new ValidadorQuota12HorasAluno())
    .encadear(new ValidadorResponsavelNaoAluno())
    .encadear(new ValidadorEscopoDelegacao())
    .encadear(new ValidadorConflitoSala());
  return inicio;
}

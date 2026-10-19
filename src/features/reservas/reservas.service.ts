import { StatusReserva, TipoCredencial, type PrismaClient, type Reserva, type SerieRecorrencia } from "@prisma/client";
import { executarTransacao } from "../../shared/database/transacao.js";
import { BusinessRuleError, ConflictError, ForbiddenError, NotFoundError } from "../../shared/errors/app-error.js";
import { CancelamentoService, type ResultadoCancelamento } from "../cancelamentos/cancelamento.service.js";
import { TipoNotificacao } from "../notificacoes/notificacao.types.js";
import { NotificacoesService } from "../notificacoes/notificacoes.service.js";
import { SalasRepository } from "../salas/salas.repository.js";
import { UsuariosRepository } from "../usuarios/usuarios.repository.js";
import type { IReservavel } from "./domain/contratos/reservavel.interface.js";
import { estadoDaReserva } from "./domain/estado/estado-reserva.js";
import type { ReservaFactory } from "./domain/fabrica/reserva.factory.js";
import type { AtorReserva, ResolvedorPoliticaReserva } from "./domain/politicas/resolvedor-politica.js";
import { anexarDiaDaSemana, type ComDiaDaSemana, type NovaReservaCommand, type RegraRecorrencia } from "./domain/reserva.types.js";
import { garantirSemConflito } from "./domain/validadores/conflito-sala.js";
import type { ValidadorReserva } from "./domain/validadores/validadores-reserva.js";
import {
  ReservasRepository,
  type FiltrosListagemReservas,
  type ReservaComLocalizacao,
} from "./reservas.repository.js";

export interface ResultadoCriacaoReserva {
  serieRecorrencia: SerieRecorrencia | null;
  reservas: ComDiaDaSemana<Reserva>[];
}

export interface DependenciasReservasService {
  prisma: PrismaClient;
  resolvedor: ResolvedorPoliticaReserva;
  pipeline: ValidadorReserva;
  factory: ReservaFactory;
  notificacoes?: NotificacoesService;
  cancelamentos?: CancelamentoService;
  relogio?: () => Date;
}

/**
 * Casos de uso de reserva. Orquestra politica (Strategy), pipeline (Chain), fabrica (Factory)
 * e ciclo de vida (State) dentro de transacoes que impedem double-booking.
 * Implementa IReservavel (Passo 3 do plano de acao).
 */
export class ReservasService implements IReservavel {
  private readonly prisma: PrismaClient;
  private readonly resolvedor: ResolvedorPoliticaReserva;
  private readonly pipeline: ValidadorReserva;
  private readonly factory: ReservaFactory;
  private readonly notificacoes: NotificacoesService;
  private readonly cancelamentos: CancelamentoService;
  private readonly relogio: () => Date;

  constructor(deps: DependenciasReservasService) {
    this.prisma = deps.prisma;
    this.resolvedor = deps.resolvedor;
    this.pipeline = deps.pipeline;
    this.factory = deps.factory;
    this.relogio = deps.relogio ?? (() => new Date());
    this.notificacoes = deps.notificacoes ?? new NotificacoesService();
    this.cancelamentos =
      deps.cancelamentos ??
      new CancelamentoService({
        prisma: this.prisma,
        notificacoes: this.notificacoes,
        relogio: this.relogio,
      });
  }

  async listar(filtros: FiltrosListagemReservas = {}): Promise<ComDiaDaSemana<Reserva>[]> {
    const reservas = await new ReservasRepository(this.prisma).listar(filtros);
    return reservas.map(anexarDiaDaSemana);
  }

  async buscarPorId(reservaId: string): Promise<ComDiaDaSemana<Reserva>> {
    const reserva = await new ReservasRepository(this.prisma).buscarPorId(reservaId);
    if (!reserva) throw new NotFoundError("Reserva nao encontrada.");
    return anexarDiaDaSemana(reserva);
  }

  async criar(ator: AtorReserva, comando: NovaReservaCommand): Promise<ResultadoCriacaoReserva> {
    const agora = this.relogio();

    const sala = await new SalasRepository(this.prisma).buscarParaReserva(comando.salaId);
    if (!sala) throw new NotFoundError("Sala nao encontrada.");
    if (!sala.ativa) throw new BusinessRuleError("A sala esta inativa e nao aceita reservas.");

    const politica = await this.resolvedor.resolver(ator, sala, agora);
    const responsavelId = comando.responsavelId ?? ator.id;
    politica.validarCriacao({ recorrente: comando.recorrencia !== undefined, delegada: responsavelId !== ator.id });

    const ocorrencias = this.factory.gerarOcorrencias(comando);
    const status = politica.definirStatusInicial();

    return executarTransacao(this.prisma, async (tx) => {
      const reservas = new ReservasRepository(tx);
      const usuarios = new UsuariosRepository(tx);

      if (status === StatusReserva.APROVADA || status === StatusReserva.AGENDADO) {
        await new SalasRepository(tx).travarAgenda(sala.id);
      }
      if (politica.exigeQuota12Horas) await usuarios.travarSolicitacoes(ator.id);

      await this.pipeline.validar({ ator, politica, sala, responsavelId, ocorrencias, agora, reservas, usuarios });

      const base = { comando, solicitanteId: ator.id, responsavelId, status, ocorrencias, agora };

      if (!temRecorrencia(comando)) {
        const [dados] = this.factory.criarReservas(base);
        const criada = await reservas.criar(dados);
        return { serieRecorrencia: null, reservas: [anexarDiaDaSemana(criada)] };
      }

      const serie = await reservas.criarSerie(this.factory.criarSerie(comando, ator.id));
      await reservas.criarVarias(this.factory.criarReservas({ ...base, serieRecorrenciaId: serie.id }));
      const criadas = await reservas.listarPorSerie(serie.id);
      return { serieRecorrencia: serie, reservas: criadas.map(anexarDiaDaSemana) };
    });
  }

  /** Implementacao do contrato IReservavel */
  async reservar(reserva: Reserva): Promise<void> {
    const reservasRepo = new ReservasRepository(this.prisma);
    await reservasRepo.criar(reserva);
  }

  /**
   * Etapa 1 do fluxo de reserva de aluno: o servidor indicado como `responsavel` aceita a
   * responsabilidade e encaminha a solicitacao ao coordenador do seu departamento.
   */
  async aceitarResponsabilidade(ator: AtorReserva, reservaId: string): Promise<ComDiaDaSemana<Reserva>> {
    const agora = this.relogio();
    const reservasRepo = new ReservasRepository(this.prisma);
    const detalhe = await reservasRepo.buscarParaCancelamento(reservaId);
    if (!detalhe) throw new NotFoundError("Reserva nao encontrada.");

    if (ator.tipoCredencial === TipoCredencial.MATRICULA_ALUNO || detalhe.responsavelId !== ator.id) {
      throw new ForbiddenError("Apenas o servidor indicado como responsavel pode aceitar esta reserva.");
    }
    if (detalhe.status !== StatusReserva.PENDENTE_APROVACAO) {
      throw new ConflictError(`Nao e possivel aceitar responsabilidade de uma reserva com status ${detalhe.status}.`);
    }
    if (detalhe.aceitoPeloResponsavelEm) {
      throw new ConflictError("A responsabilidade por esta reserva ja foi aceita.");
    }

    await this.transicionar(reservasRepo, detalhe, {
      aceitoPeloResponsavelEm: agora,
    });

    await this.notificacoes.notificarEncaminhamentoReserva({
      tipo: TipoNotificacao.ENCAMINHAMENTO_RESERVA_ALUNO,
      reservaId: detalhe.id,
      solicitanteId: detalhe.solicitanteId,
      responsavelId: ator.id,
      departamentoId: detalhe.responsavelDepartamentoId ?? undefined,
      criadoEm: agora,
    });

    return this.recarregar(reservasRepo, detalhe.id);
  }

  async aprovar(ator: AtorReserva, reservaId: string): Promise<ComDiaDaSemana<Reserva>> {
    const agora = this.relogio();
    const reserva = await this.carregar(reservaId);
    const politica = await this.resolvedor.resolver(ator, reserva, agora);

    // Se o ator nao for o coordenador da sala, mas for o servidor responsavel pela reserva de aluno,
    // executa o aceite do responsavel e encaminha ao coordenador.
    if (!politica.podeAprovarOuRejeitar()) {
      if (
        ator.tipoCredencial !== TipoCredencial.MATRICULA_ALUNO &&
        reserva.responsavelId === ator.id &&
        reserva.solicitanteId !== reserva.responsavelId
      ) {
        return this.aceitarResponsabilidade(ator, reservaId);
      }
      throw new ForbiddenError("Apenas o coordenador do predio/setor da sala pode aprovar ou rejeitar esta reserva.");
    }

    // Regra do diagrama para reserva de aluno (solicitante != responsavel):
    // exige aceite previo do servidor responsavel, exceto quando o proprio coordenador e o responsavel.
    if (
      reserva.solicitanteId !== reserva.responsavelId &&
      reserva.responsavelId !== ator.id &&
      !reserva.aceitoPeloResponsavelEm
    ) {
      throw new BusinessRuleError(
        "A reserva de aluno precisa primeiro ser aceita pelo servidor responsavel antes da aprovacao final do coordenador.",
      );
    }

    const novoStatus = estadoDaReserva(reserva.status).aprovar();

    const aprovada = await executarTransacao(this.prisma, async (tx) => {
      const reservas = new ReservasRepository(tx);
      await new SalasRepository(tx).travarAgenda(reserva.salaId);

      const ocorrencia = { inicio: reserva.dataHoraInicio, fim: reserva.dataHoraFim };
      const bloqueantes = await reservas.listarIntervalosNaJanela(
        reserva.salaId,
        [StatusReserva.APROVADA, StatusReserva.AGENDADO],
        ocorrencia.inicio,
        ocorrencia.fim,
        reserva.id,
      );
      garantirSemConflito([ocorrencia], bloqueantes);

      await this.transicionar(reservas, reserva, {
        status: novoStatus,
        analisadoPorId: ator.id,
        analisadoEm: agora,
        ...(reserva.responsavelId === ator.id && !reserva.aceitoPeloResponsavelEm
          ? { aceitoPeloResponsavelEm: agora }
          : {}),
      });
      return this.recarregar(reservas, reserva.id);
    });

    await this.notificacoes.notificarEstadoReserva({
      tipo: TipoNotificacao.APROVACAO_RESERVA,
      reservaId: aprovada.id,
      solicitanteId: aprovada.solicitanteId,
      alteradoPorId: ator.id,
      dataHoraInicio: aprovada.dataHoraInicio,
      dataHoraFim: aprovada.dataHoraFim,
      criadoEm: agora,
    });

    return aprovada;
  }

  async rejeitar(ator: AtorReserva, reservaId: string, motivo: string): Promise<ComDiaDaSemana<Reserva>> {
    const agora = this.relogio();
    const reserva = await this.carregarComPermissaoDeAnalise(ator, reservaId, agora);
    const novoStatus = estadoDaReserva(reserva.status).rejeitar();

    const reservas = new ReservasRepository(this.prisma);
    await this.transicionar(reservas, reserva, {
      status: novoStatus,
      motivoRejeicao: motivo,
      analisadoPorId: ator.id,
      analisadoEm: agora,
    });
    const rejeitada = await this.recarregar(reservas, reserva.id);

    await this.notificacoes.notificarEstadoReserva({
      tipo: TipoNotificacao.REJEICAO_RESERVA,
      reservaId: rejeitada.id,
      solicitanteId: rejeitada.solicitanteId,
      alteradoPorId: ator.id,
      dataHoraInicio: rejeitada.dataHoraInicio,
      dataHoraFim: rejeitada.dataHoraFim,
      motivo,
      criadoEm: agora,
    });

    return rejeitada;
  }

  /** Delega ao CancelamentoService central para manter uma unica fonte de verdade entre rotas. */
  async cancelar(ator: AtorReserva, reservaId: string, justificativa: string): Promise<ResultadoCancelamento> {
    return this.cancelamentos.cancelar(ator, reservaId, justificativa);
  }

  private async carregar(reservaId: string): Promise<ReservaComLocalizacao> {
    const reserva = await new ReservasRepository(this.prisma).buscarComLocalizacao(reservaId);
    if (!reserva) throw new NotFoundError("Reserva nao encontrada.");
    return reserva;
  }

  private async carregarComPermissaoDeAnalise(
    ator: AtorReserva,
    reservaId: string,
    agora: Date,
  ): Promise<ReservaComLocalizacao> {
    const reserva = await this.carregar(reservaId);
    const politica = await this.resolvedor.resolver(ator, reserva, agora);
    if (!politica.podeAprovarOuRejeitar()) {
      throw new ForbiddenError("Apenas o coordenador do predio/setor da sala pode aprovar ou rejeitar esta reserva.");
    }
    return reserva;
  }

  /** Aplica a transicao somente se o status nao mudou desde a leitura (protege contra corrida). */
  private async transicionar(
    reservas: ReservasRepository,
    reserva: Reserva,
    dados: Parameters<ReservasRepository["atualizarSeStatus"]>[2],
  ): Promise<void> {
    const atualizada = await reservas.atualizarSeStatus(reserva.id, reserva.status, dados);
    if (!atualizada) {
      throw new ConflictError("A reserva foi alterada por outra operacao. Recarregue e tente novamente.");
    }
  }

  private async recarregar(reservas: ReservasRepository, id: string): Promise<ComDiaDaSemana<Reserva>> {
    const reserva = await reservas.buscarPorId(id);
    if (!reserva) throw new NotFoundError("Reserva nao encontrada.");
    return anexarDiaDaSemana(reserva);
  }
}

function temRecorrencia(comando: NovaReservaCommand): comando is NovaReservaCommand & { recorrencia: RegraRecorrencia } {
  return comando.recorrencia !== undefined;
}

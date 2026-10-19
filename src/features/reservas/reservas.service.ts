import { StatusReserva, type PrismaClient, type Reserva, type SerieRecorrencia } from "@prisma/client";
import { executarTransacao } from "../../shared/database/transacao.js";
import { BusinessRuleError, ConflictError, ForbiddenError, NotFoundError } from "../../shared/errors/app-error.js";
import { SalasRepository } from "../salas/salas.repository.js";
import { UsuariosRepository } from "../usuarios/usuarios.repository.js";
import { estadoDaReserva } from "./domain/estado/estado-reserva.js";
import type { ReservaFactory } from "./domain/fabrica/reserva.factory.js";
import type { AtorReserva, ResolvedorPoliticaReserva } from "./domain/politicas/resolvedor-politica.js";
import type { NovaReservaCommand, RegraRecorrencia } from "./domain/reserva.types.js";
import { garantirSemConflito } from "./domain/validadores/conflito-sala.js";
import type { ValidadorReserva } from "./domain/validadores/validadores-reserva.js";
import type { IReservavel } from "./domain/contratos/reservavel.interface.js";
import { ReservasRepository, type ReservaComLocalizacao } from "./reservas.repository.js";

export interface ResultadoCriacaoReserva {
  serieRecorrencia: SerieRecorrencia | null;
  reservas: Reserva[];
}

export interface DependenciasReservasService {
  prisma: PrismaClient;
  resolvedor: ResolvedorPoliticaReserva;
  pipeline: ValidadorReserva;
  factory: ReservaFactory;
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
  private readonly relogio: () => Date;

  constructor(deps: DependenciasReservasService) {
    this.prisma = deps.prisma;
    this.resolvedor = deps.resolvedor;
    this.pipeline = deps.pipeline;
    this.factory = deps.factory;
    this.relogio = deps.relogio ?? (() => new Date());
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

      // Reservas aprovadas/agendadas bloqueiam horarios; serializa escritas concorrentes na sala.
      if (status === StatusReserva.APROVADA || status === StatusReserva.AGENDADO) {
        await new SalasRepository(tx).travarAgenda(sala.id);
      }
      // Serializa pedidos concorrentes do mesmo aluno para a quota de 12 horas.
      if (politica.exigeQuota12Horas) await usuarios.travarSolicitacoes(ator.id);

      await this.pipeline.validar({ ator, politica, sala, responsavelId, ocorrencias, agora, reservas, usuarios });

      const base = { comando, solicitanteId: ator.id, responsavelId, status, ocorrencias, agora };

      if (!temRecorrencia(comando)) {
        const [dados] = this.factory.criarReservas(base);
        return { serieRecorrencia: null, reservas: [await reservas.criar(dados)] };
      }

      const serie = await reservas.criarSerie(this.factory.criarSerie(comando, ator.id));
      await reservas.criarVarias(this.factory.criarReservas({ ...base, serieRecorrenciaId: serie.id }));
      return { serieRecorrencia: serie, reservas: await reservas.listarPorSerie(serie.id) };
    });
  }

  /** Implementacao do contrato IReservavel */
  async reservar(reserva: Reserva): Promise<void> {
    const reservasRepo = new ReservasRepository(this.prisma);
    await reservasRepo.criar(reserva);
  }

  async aprovar(ator: AtorReserva, reservaId: string): Promise<Reserva> {
    const agora = this.relogio();
    const reserva = await this.carregarComPermissaoDeAnalise(ator, reservaId, agora);
    const novoStatus = estadoDaReserva(reserva.status).aprovar();

    return executarTransacao(this.prisma, async (tx) => {
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
      });
      return this.recarregar(reservas, reserva.id);
    });
  }

  async rejeitar(ator: AtorReserva, reservaId: string, motivo: string): Promise<Reserva> {
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
    return this.recarregar(reservas, reserva.id);
  }

  async cancelar(ator: AtorReserva, reservaId: string, justificativa: string): Promise<Reserva> {
    const agora = this.relogio();
    const reserva = await this.carregar(reservaId);

    const politica = await this.resolvedor.resolver(ator, reserva, agora);
    if (!politica.podeCancelar(ator.id, reserva, agora)) {
      throw new ForbiddenError("Voce nao tem permissao para cancelar esta reserva.");
    }
    const novoStatus = estadoDaReserva(reserva.status).cancelar();

    const reservas = new ReservasRepository(this.prisma);
    await this.transicionar(reservas, reserva, {
      status: novoStatus,
      cancelamento: { set: { canceladoPorId: ator.id, justificativa, canceladoEm: agora } },
    });
    return this.recarregar(reservas, reserva.id);
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

  private async recarregar(reservas: ReservasRepository, id: string): Promise<Reserva> {
    const reserva = await reservas.buscarPorId(id);
    if (!reserva) throw new NotFoundError("Reserva nao encontrada.");
    return reserva;
  }
}

function temRecorrencia(comando: NovaReservaCommand): comando is NovaReservaCommand & { recorrencia: RegraRecorrencia } {
  return comando.recorrencia !== undefined;
}


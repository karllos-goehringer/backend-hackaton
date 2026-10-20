import { StatusReserva, TipoCredencial, type PrismaClient, type Reserva } from "@prisma/client";
import { executarTransacao } from "../../shared/database/transacao.js";
import { BusinessRuleError, ConflictError, ForbiddenError, NotFoundError } from "../../shared/errors/app-error.js";
import { EscopoCoordenacaoService } from "../coordenacao/escopo-coordenacao.service.js";
import { LotacoesRepository } from "../coordenacao/lotacoes.repository.js";
import { TipoNotificacao, type NotificacaoCancelamento } from "../notificacoes/notificacao.types.js";
import type { NotificacoesService } from "../notificacoes/notificacoes.service.js";
import type { ICancelavel } from "../reservas/domain/contratos/cancelavel.interface.js";
import { estadoDaReserva } from "../reservas/domain/estado/estado-reserva.js";
import { NivelAcesso } from "../reservas/domain/nivel-acesso.js";
import { ResolvedorPoliticaReserva, type AtorReserva } from "../reservas/domain/politicas/resolvedor-politica.js";
import { anexarDiaDaSemana, type ComDiaDaSemana } from "../reservas/domain/reserva.types.js";
import { ReservasRepository, type ReservaDetalhada } from "../reservas/reservas.repository.js";
import { SalasRepository } from "../salas/salas.repository.js";

export interface DependenciasCancelamentoService {
  prisma: PrismaClient;
  notificacoes: NotificacoesService;
  relogio?: () => Date;
}

export interface ResultadoCancelamento {
  reserva: ComDiaDaSemana<Reserva | ReservaDetalhada> | null;
  solicitacaoEnviada: boolean;
  solicitacao?: NotificacaoCancelamento;
  mensagem: string;
}

export interface ResultadoAprovacaoCancelamentoProfessor {
  solicitacao: NotificacaoCancelamento;
  reservaCancelada: ComDiaDaSemana<Reserva | ReservaDetalhada>;
  novaReserva: ComDiaDaSemana<Reserva | ReservaDetalhada>;
  mensagem: string;
}

export interface ResultadoRejeicaoCancelamentoProfessor {
  solicitacao: NotificacaoCancelamento;
  reservaMantida: ComDiaDaSemana<Reserva | ReservaDetalhada>;
  mensagem: string;
}

/**
 * Servico central pelo fluxo e regras de cancelamento de reservas.
 * Implementa ICancelavel e concentra toda a validacao de permissao e limite temporal.
 */
export class CancelamentoService implements ICancelavel {
  private readonly prisma: PrismaClient;
  private readonly notificacoes: NotificacoesService;
  private readonly relogio: () => Date;

  constructor(deps: DependenciasCancelamentoService) {
    this.prisma = deps.prisma;
    this.notificacoes = deps.notificacoes;
    this.relogio = deps.relogio ?? (() => new Date());
  }

  /**
   * Implementacao do contrato ICancelavel (efetivacao direta respeitando o limite temporal).
   */
  async cancelarReserva(reserva: Reserva, canceladorId: string, justificativa: string): Promise<void> {
    const agora = this.relogio();
    this.garantirAntesDoInicio(reserva, agora);
    await this.efetivarCancelamento(reserva, canceladorId, justificativa, agora);
  }

  listarSolicitacoesPendentes(): readonly NotificacaoCancelamento[] {
    return this.notificacoes.obterPendentes();
  }

  /**
   * Endpoint exclusivo para PROFESSOR solicitar ao COORDENADOR o cancelamento/substituicao
   * de uma reserva cujo solicitante e um ALUNO.
   */
  async solicitarCancelamentoProfessor(
    ator: AtorReserva,
    reservaId: string,
    justificativa: string,
    finalidade?: string,
  ): Promise<ResultadoCancelamento> {
    const agora = this.relogio();
    const reservasRepo = new ReservasRepository(this.prisma);
    const reserva = await reservasRepo.buscarComLocalizacao(reservaId);

    if (!reserva) {
      throw new NotFoundError("Reserva nao encontrada.");
    }

    const nivel = await this.resolverNivelAtor(ator, reserva);
    if (nivel !== NivelAcesso.PROFESSOR) {
      throw new ForbiddenError(
        "Apenas professores podem solicitar ao coordenador o cancelamento e substituicao de reserva de aluno.",
      );
    }

    const detalhe = await reservasRepo.buscarParaCancelamento(reservaId);
    if (!detalhe || detalhe.solicitanteTipo !== TipoCredencial.MATRICULA_ALUNO) {
      throw new ForbiddenError(
        "O professor so pode solicitar ao coordenador o cancelamento de reservas cujo solicitante seja um aluno.",
      );
    }

    // Valida que a reserva pode ser cancelada (nao esta cancelada/rejeitada/concluida) e ainda nao iniciou
    estadoDaReserva(reserva.status).cancelar();
    this.garantirAntesDoInicio(reserva, agora);

    const solicitacao = await this.notificacoes.notificarSolicitacaoCancelamento({
      tipo: TipoNotificacao.SOLICITACAO_CANCELAMENTO,
      reservaId: reserva.id,
      solicitadoPorId: ator.id,
      departamentoId: detalhe.responsavelDepartamentoId ?? undefined,
      justificativa,
      ...(finalidade ? { finalidade } : {}),
      status: "PENDENTE",
      criadoEm: agora,
    });

    return {
      reserva: null,
      solicitacaoEnviada: true,
      solicitacao,
      mensagem: "Solicitacao de cancelamento enviada ao coordenador do departamento para avaliacao.",
    };
  }

  /**
   * Coordenador aprova a solicitacao do professor:
   * - Cancela a reserva do aluno
   * - Cria uma nova reserva no mesmo horario/sala com o professor como solicitante e responsavel (status AGENDADO)
   */
  async aprovarSolicitacaoCancelamento(
    ator: AtorReserva,
    idOuReservaId: string,
  ): Promise<ResultadoAprovacaoCancelamentoProfessor> {
    const agora = this.relogio();
    await this.garantirCoordenador(ator);

    const solicitacao = this.notificacoes.buscarSolicitacaoPendente(idOuReservaId);
    if (!solicitacao) {
      throw new NotFoundError("Solicitacao de cancelamento pendente nao encontrada.");
    }

    const reservasRepo = new ReservasRepository(this.prisma);
    const detalhe = await reservasRepo.buscarParaCancelamento(solicitacao.reservaId);
    if (!detalhe) {
      throw new NotFoundError("Reserva original do aluno nao encontrada.");
    }
    if (detalhe.solicitanteTipo !== TipoCredencial.MATRICULA_ALUNO) {
      throw new BusinessRuleError("A solicitacao de substituicao aplica-se apenas a reservas solicitadas por alunos.");
    }

    const novoStatusCancelada = estadoDaReserva(detalhe.status).cancelar();
    this.garantirAntesDoInicio(detalhe, agora);

    const { reservaCancelada, novaReserva } = await executarTransacao(this.prisma, async (tx) => {
      const reservasTx = new ReservasRepository(tx);
      await new SalasRepository(tx).travarAgenda(detalhe.salaId);

      const atualizada = await reservasTx.atualizarSeStatus(detalhe.id, detalhe.status, {
        status: novoStatusCancelada,
        analisadoPorId: ator.id,
        analisadoEm: agora,
        cancelamento: {
          set: {
            canceladoPorId: ator.id,
            justificativa: solicitacao.justificativa,
            canceladoEm: agora,
          },
        },
      });

      if (!atualizada) {
        throw new ConflictError("A reserva do aluno foi alterada por outra operacao. Recarregue e tente novamente.");
      }

      const criada = await reservasTx.criar({
        salaId: detalhe.salaId,
        solicitanteId: solicitacao.solicitadoPorId,
        responsavelId: solicitacao.solicitadoPorId,
        serieRecorrenciaId: null,
        dataHoraInicio: detalhe.dataHoraInicio,
        dataHoraFim: detalhe.dataHoraFim,
        finalidade: solicitacao.finalidade ?? detalhe.finalidade ?? "Reserva de sala",
        observacoes: `Reserva criada por aprovacao de solicitacao do professor sobre a reserva ${detalhe.id}.`,
        status: StatusReserva.AGENDADO,
        aceitoPeloResponsavelEm: agora,
        analisadoPorId: ator.id,
        analisadoEm: agora,
      });

      const canceladaDetalhe =
        (await reservasTx.buscarDetalhesPorId(detalhe.id)) ?? (await reservasTx.buscarPorId(detalhe.id));
      const criadaDetalhe =
        (await reservasTx.buscarDetalhesPorId(criada.id)) ?? (await reservasTx.buscarPorId(criada.id)) ?? criada;

      if (!canceladaDetalhe) {
        throw new NotFoundError("Reserva cancelada nao encontrada apos atualizacao.");
      }

      return {
        reservaCancelada: canceladaDetalhe,
        novaReserva: criadaDetalhe,
      };
    });

    this.notificacoes.removerSolicitacaoPendente(idOuReservaId);
    solicitacao.status = "APROVADA";
    solicitacao.analisadoPorId = ator.id;
    solicitacao.analisadoEm = agora;
    solicitacao.novaReservaId = novaReserva.id;

    await this.notificacoes.notificarEstadoReserva({
      tipo: TipoNotificacao.CANCELAMENTO_RESERVA,
      reservaId: reservaCancelada.id,
      solicitanteId: reservaCancelada.solicitanteId,
      alteradoPorId: ator.id,
      dataHoraInicio: reservaCancelada.dataHoraInicio,
      dataHoraFim: reservaCancelada.dataHoraFim,
      justificativa: solicitacao.justificativa,
      criadoEm: agora,
    });

    await this.notificacoes.notificarEstadoReserva({
      tipo: TipoNotificacao.APROVACAO_RESERVA,
      reservaId: novaReserva.id,
      solicitanteId: novaReserva.solicitanteId,
      alteradoPorId: ator.id,
      dataHoraInicio: novaReserva.dataHoraInicio,
      dataHoraFim: novaReserva.dataHoraFim,
      criadoEm: agora,
    });

    return {
      solicitacao,
      reservaCancelada: anexarDiaDaSemana(reservaCancelada),
      novaReserva: anexarDiaDaSemana(novaReserva),
      mensagem:
        "Solicitacao do professor aprovada pelo coordenador: reserva do aluno cancelada e nova reserva criada para o professor.",
    };
  }

  /**
   * Coordenador rejeita a solicitacao do professor:
   * - A reserva do aluno e mantida inalterada para o aluno.
   */
  async rejeitarSolicitacaoCancelamento(
    ator: AtorReserva,
    idOuReservaId: string,
    motivo?: string,
  ): Promise<ResultadoRejeicaoCancelamentoProfessor> {
    const agora = this.relogio();
    await this.garantirCoordenador(ator);

    const solicitacao = this.notificacoes.buscarSolicitacaoPendente(idOuReservaId);
    if (!solicitacao) {
      throw new NotFoundError("Solicitacao de cancelamento pendente nao encontrada.");
    }

    const reservasRepo = new ReservasRepository(this.prisma);
    const reservaMantida =
      (await reservasRepo.buscarDetalhesPorId(solicitacao.reservaId)) ??
      (await reservasRepo.buscarPorId(solicitacao.reservaId));

    if (!reservaMantida) {
      throw new NotFoundError("Reserva do aluno nao encontrada.");
    }

    this.notificacoes.removerSolicitacaoPendente(idOuReservaId);
    solicitacao.status = "REJEITADA";
    solicitacao.motivoRejeicao = motivo ?? "Solicitacao de cancelamento rejeitada pelo coordenador.";
    solicitacao.analisadoPorId = ator.id;
    solicitacao.analisadoEm = agora;

    return {
      solicitacao,
      reservaMantida: anexarDiaDaSemana(reservaMantida),
      mensagem: "Solicitacao do professor rejeitada pelo coordenador: a reserva se mantem para o aluno.",
    };
  }

  /**
   * Processa uma acao de cancelamento conforme o perfil do usuario:
   * - Coordenador: pode cancelar reservas de aluno, tecnico e professor quando quiser (e a propria reserva), sem hierarquia por predio.
   * - Aluno, Tecnico e Professor: so podem cancelar diretamente a propria reserva (`solicitanteId === ator.id`).
   * - Se Professor acionar em reserva de Aluno, registra a solicitacao de cancelamento para o coordenador.
   */
  async cancelar(
    ator: AtorReserva,
    reservaId: string,
    justificativa: string,
  ): Promise<ResultadoCancelamento> {
    const agora = this.relogio();
    const reservasRepo = new ReservasRepository(this.prisma);
    const reserva = await reservasRepo.buscarComLocalizacao(reservaId);

    if (!reserva) {
      throw new NotFoundError("Reserva nao encontrada.");
    }

    const nivel = await this.resolverNivelAtor(ator, reserva);

    // 1. Aluno: pode cancelar apenas a propria reserva (solicitanteId === ator.id) antes do inicio
    if (nivel === NivelAcesso.ALUNO) {
      if (reserva.solicitanteId !== ator.id) {
        throw new ForbiddenError("Alunos nao tem permissao para cancelar reservas de outros usuarios.");
      }
      this.garantirAntesDoInicio(reserva, agora);
      const cancelada = await this.efetivarCancelamento(reserva, ator.id, justificativa, agora);
      return {
        reserva: anexarDiaDaSemana(cancelada),
        solicitacaoEnviada: false,
        mensagem: "Reserva cancelada com sucesso.",
      };
    }

    // 2. Coordenador: pode cancelar reservas de aluno, tecnico e professor (ou a propria reserva)
    // em qualquer predio, desde que a reserva nao pertenca a outro coordenador.
    if (nivel === NivelAcesso.COORDENADOR) {
      if (
        (reserva.responsavelId !== ator.id && reserva.responsavelEhCoordenador) ||
        (reserva.solicitanteId !== ator.id && reserva.solicitanteEhCoordenador)
      ) {
        throw new ForbiddenError(
          "Um coordenador nao pode cancelar reservas que estao sob a responsabilidade de outro coordenador.",
        );
      }
      this.garantirAntesDoInicio(reserva, agora);
      const cancelada = await this.efetivarCancelamento(reserva, ator.id, justificativa, agora);
      return {
        reserva: anexarDiaDaSemana(cancelada),
        solicitacaoEnviada: false,
        mensagem: "Reserva cancelada pelo coordenador.",
      };
    }

    // 3. Professor: so pode cancelar diretamente a propria reserva (solicitanteId === ator.id);
    // para reserva de aluno, envia solicitacao de cancelamento/substituicao ao coordenador.
    if (nivel === NivelAcesso.PROFESSOR) {
      const ehPropria = reserva.solicitanteId === ator.id;
      if (ehPropria) {
        this.garantirAntesDoInicio(reserva, agora);
        const cancelada = await this.efetivarCancelamento(reserva, ator.id, justificativa, agora);
        return {
          reserva: anexarDiaDaSemana(cancelada),
          solicitacaoEnviada: false,
          mensagem: "Reserva cancelada com sucesso.",
        };
      }

      const detalhe = await reservasRepo.buscarParaCancelamento(reservaId);
      if (detalhe && detalhe.solicitanteTipo === TipoCredencial.MATRICULA_ALUNO) {
        return this.solicitarCancelamentoProfessor(ator, reservaId, justificativa);
      }

      throw new ForbiddenError(
        "Professores so podem cancelar as proprias reservas ou solicitar ao coordenador o cancelamento de reservas de alunos.",
      );
    }

    // 4. Tecnico: cancela apenas a propria reserva (solicitanteId === ator.id) antes do inicio
    if (nivel === NivelAcesso.TECNICO) {
      const ehPropria = reserva.solicitanteId === ator.id;
      if (!ehPropria) {
        throw new ForbiddenError("Tecnicos podem cancelar apenas as proprias reservas.");
      }
      this.garantirAntesDoInicio(reserva, agora);
      const cancelada = await this.efetivarCancelamento(reserva, ator.id, justificativa, agora);
      return {
        reserva: anexarDiaDaSemana(cancelada),
        solicitacaoEnviada: false,
        mensagem: "Reserva cancelada com sucesso.",
      };
    }

    throw new ForbiddenError("Voce nao tem permissao para cancelar esta reserva.");
  }

  private async resolverNivelAtor(
    ator: AtorReserva,
    sala: { predioId?: string | null },
  ): Promise<NivelAcesso> {
    const escopo = new EscopoCoordenacaoService(new LotacoesRepository(this.prisma));
    const resolvedor = new ResolvedorPoliticaReserva(escopo);
    const politica = await resolvedor.resolver(ator, {
      predioId: sala.predioId ?? "",
    });
    return politica.nivel;
  }

  private async garantirCoordenador(ator: AtorReserva): Promise<void> {
    const nivel = await this.resolverNivelAtor(ator, { predioId: null });
    if (nivel !== NivelAcesso.COORDENADOR) {
      throw new ForbiddenError("Apenas coordenadores podem aprovar ou rejeitar solicitacoes de cancelamento.");
    }
  }

  private garantirAntesDoInicio(reserva: Pick<Reserva, "dataHoraInicio">, agora: Date): void {
    if (agora.getTime() >= reserva.dataHoraInicio.getTime()) {
      throw new BusinessRuleError("Nao e possivel cancelar uma reserva cujo horario ja iniciou.", {
        dataHoraInicio: reserva.dataHoraInicio.toISOString(),
        agora: agora.toISOString(),
      });
    }
  }

  private async efetivarCancelamento(
    reserva: Reserva,
    canceladorId: string,
    justificativa: string,
    agora: Date,
  ): Promise<Reserva | ReservaDetalhada> {
    const novoStatus = estadoDaReserva(reserva.status).cancelar();
    const reservasRepo = new ReservasRepository(this.prisma);

    const atualizada = await reservasRepo.atualizarSeStatus(reserva.id, reserva.status, {
      status: novoStatus,
      cancelamento: {
        set: {
          canceladoPorId: canceladorId,
          justificativa,
          canceladoEm: agora,
        },
      },
    });

    if (!atualizada) {
      throw new ConflictError("A reserva foi alterada por outra operacao. Recarregue e tente novamente.");
    }

    const reservaAtualizada =
      (await reservasRepo.buscarDetalhesPorId(reserva.id)) ??
      (await reservasRepo.buscarPorId(reserva.id));
    if (!reservaAtualizada) {
      throw new NotFoundError("Reserva nao encontrada apos atualizacao.");
    }

    await this.notificacoes.notificarEstadoReserva({
      tipo: TipoNotificacao.CANCELAMENTO_RESERVA,
      reservaId: reservaAtualizada.id,
      solicitanteId: reservaAtualizada.solicitanteId,
      alteradoPorId: canceladorId,
      dataHoraInicio: reservaAtualizada.dataHoraInicio,
      dataHoraFim: reservaAtualizada.dataHoraFim,
      justificativa,
      criadoEm: agora,
    });

    return reservaAtualizada;
  }
}

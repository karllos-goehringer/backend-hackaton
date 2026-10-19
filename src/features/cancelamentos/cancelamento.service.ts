import { TipoCredencial, type PrismaClient, type Reserva } from "@prisma/client";
import { BusinessRuleError, ConflictError, ForbiddenError, NotFoundError } from "../../shared/errors/app-error.js";
import { EscopoCoordenacaoService } from "../coordenacao/escopo-coordenacao.service.js";
import { LotacoesRepository } from "../coordenacao/lotacoes.repository.js";
import { TipoNotificacao, type NotificacaoCancelamento } from "../notificacoes/notificacao.types.js";
import type { NotificacoesService } from "../notificacoes/notificacoes.service.js";
import type { ICancelavel } from "../reservas/domain/contratos/cancelavel.interface.js";
import { estadoDaReserva } from "../reservas/domain/estado/estado-reserva.js";
import { NivelAcesso } from "../reservas/domain/nivel-acesso.js";
import { ResolvedorPoliticaReserva, type AtorReserva } from "../reservas/domain/politicas/resolvedor-politica.js";
import { anexarDiaDaSemana } from "../reservas/domain/reserva.types.js";
import { ReservasRepository } from "../reservas/reservas.repository.js";

export interface DependenciasCancelamentoService {
  prisma: PrismaClient;
  notificacoes: NotificacoesService;
  relogio?: () => Date;
}

export interface ResultadoCancelamento {
  reserva: Reserva | null;
  solicitacaoEnviada: boolean;
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
   * Processa uma acao de cancelamento ou solicitacao de cancelamento conforme o perfil do usuario.
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

    const escopo = new EscopoCoordenacaoService(new LotacoesRepository(this.prisma));
    const resolvedor = new ResolvedorPoliticaReserva(escopo);
    const politica = await resolvedor.resolver(ator, reserva, agora);
    const nivel = politica.nivel;

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

    // 2. Coordenador: pode cancelar qualquer reserva no seu escopo antes do inicio
    if (nivel === NivelAcesso.COORDENADOR) {
      this.garantirAntesDoInicio(reserva, agora);
      const cancelada = await this.efetivarCancelamento(reserva, ator.id, justificativa, agora);
      return {
        reserva: anexarDiaDaSemana(cancelada),
        solicitacaoEnviada: false,
        mensagem: "Reserva cancelada pelo coordenador.",
      };
    }

    // 3. Professor: pode cancelar a propria reserva (solicitanteId === ator.id) ou solicitar cancelamento de reserva de aluno
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

      // Se nao for solicitada pelo proprio professor, verifica se a reserva e de um aluno
      const detalhe = await reservasRepo.buscarParaCancelamento(reservaId);
      if (detalhe && detalhe.solicitanteTipo === TipoCredencial.MATRICULA_ALUNO) {
        this.garantirAntesDoInicio(reserva, agora);
        // Envia solicitacao para o coordenador do departamento do responsavel
        await this.notificacoes.notificarSolicitacaoCancelamento({
          tipo: TipoNotificacao.SOLICITACAO_CANCELAMENTO,
          reservaId: reserva.id,
          solicitadoPorId: ator.id,
          departamentoId: detalhe.responsavelDepartamentoId ?? undefined,
          justificativa,
          criadoEm: agora,
        });

        return {
          reserva: null,
          solicitacaoEnviada: true,
          mensagem: "Solicitacao de cancelamento enviada ao coordenador do departamento para avaliacao.",
        };
      }

      throw new ForbiddenError("Professores so podem cancelar as proprias reservas ou solicitar cancelamento de reservas de alunos.");
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
  ): Promise<Reserva> {
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

    const reservaAtualizada = await reservasRepo.buscarPorId(reserva.id);
    if (!reservaAtualizada) {
      throw new NotFoundError("Reserva nao encontrada apos atualizacao.");
    }
    return reservaAtualizada;
  }
}

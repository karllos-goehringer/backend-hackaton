import test, { describe } from "node:test";
import assert from "node:assert/strict";
import { StatusReserva, TipoCredencial } from "@prisma/client";
import { BusinessRuleError, ForbiddenError } from "../src/shared/errors/app-error.js";
import { NivelAcesso } from "../src/features/reservas/domain/nivel-acesso.js";
import {
  PoliticaAlunoStrategy,
  PoliticaProfessorStrategy,
  PoliticaTecnicoStrategy,
} from "../src/features/reservas/domain/politicas/politica-reserva.strategy.js";
import {
  ValidadorDuracao50Minutos,
  ValidadorAntecedencia12Horas,
  ValidadorLimiteDiarioReservas,
  ValidadorResponsavelNaoAluno,
  type ContextoValidacaoReserva,
} from "../src/features/reservas/domain/validadores/validadores-reserva.js";
import { CancelamentoService } from "../src/features/cancelamentos/cancelamento.service.js";
import { NotificacoesService } from "../src/features/notificacoes/notificacoes.service.js";

describe("Testes Automatizados - Plano de Acao (Passo 5)", () => {
  const agora = new Date("2026-10-20T08:00:00Z");

  // Helper para criar mock de sala e contexto
  const salaMock = {
    id: "60d5ec49f1b2c8b1f8e4e1a1",
    codigo: "SALA-101",
    ativa: true,
    predioId: "60d5ec49f1b2c8b1f8e4e1a2",
    setorId: "60d5ec49f1b2c8b1f8e4e1a3",
  };

  test("1. Tentar criar reserva com duracao diferente de 50 minutos (deve falhar)", async () => {
    const validador = new ValidadorDuracao50Minutos();

    // 60 minutos em vez de 50
    const inicio = new Date("2026-10-21T10:00:00Z");
    const fimInvalido = new Date("2026-10-21T11:00:00Z"); // 60 min

    const contextoInvalido = {
      ocorrencias: [{ inicio, fim: fimInvalido }],
    } as unknown as ContextoValidacaoReserva;

    await assert.rejects(
      async () => await validador.validar(contextoInvalido),
      (err: unknown) => {
        assert(err instanceof BusinessRuleError);
        assert.match(err.message, /deve ser exatamente 50 minutos/);
        return true;
      },
    );

    // 50 minutos exatos (deve passar)
    const fimValido = new Date(inicio.getTime() + 50 * 60 * 1000);
    const contextoValido = {
      ocorrencias: [{ inicio, fim: fimValido }],
    } as unknown as ContextoValidacaoReserva;

    await assert.doesNotReject(async () => await validador.validar(contextoValido));
  });

  test("2. Tentar criar reserva para Aluno/Tecnico com menos de 12 horas de antecedencia (deve falhar)", async () => {
    const validador = new ValidadorAntecedencia12Horas();
    const politicaAluno = new PoliticaAlunoStrategy();

    // Reserva daqui a apenas 2 horas (menos que 12h)
    const inicioInvalido = new Date(agora.getTime() + 2 * 60 * 60 * 1000);
    const fimInvalido = new Date(inicioInvalido.getTime() + 50 * 60 * 1000);

    const contextoInvalido = {
      politica: politicaAluno,
      ocorrencias: [{ inicio: inicioInvalido, fim: fimInvalido }],
      agora,
    } as unknown as ContextoValidacaoReserva;

    await assert.rejects(
      async () => await validador.validar(contextoInvalido),
      (err: unknown) => {
        assert(err instanceof BusinessRuleError);
        assert.match(err.message, /no minimo 12 horas de antecedencia/);
        return true;
      },
    );

    // Reserva com 14 horas de antecedencia (deve passar)
    const inicioValido = new Date(agora.getTime() + 14 * 60 * 60 * 1000);
    const fimValido = new Date(inicioValido.getTime() + 50 * 60 * 1000);
    const contextoValido = {
      politica: politicaAluno,
      ocorrencias: [{ inicio: inicioValido, fim: fimValido }],
      agora,
    } as unknown as ContextoValidacaoReserva;

    await assert.doesNotReject(async () => await validador.validar(contextoValido));
  });

  test("3. Tentar criar a 3a reserva no mesmo dia para o mesmo Aluno ou Tecnico (deve falhar)", async () => {
    const validador = new ValidadorLimiteDiarioReservas();
    const politicaTecnico = new PoliticaTecnicoStrategy();

    const inicio = new Date("2026-10-21T10:00:00Z");
    const fim = new Date(inicio.getTime() + 50 * 60 * 1000);

    // Simula que o usuario ja tem 2 reservas ativas no dia
    const reservasRepoMock = {
      contarPorSolicitanteNoDia: async () => 2,
    };

    const contextoInvalido = {
      politica: politicaTecnico,
      ator: { id: "user-123", tipoCredencial: TipoCredencial.SIAPE_TECNICO },
      ocorrencias: [{ inicio, fim }],
      reservas: reservasRepoMock,
    } as unknown as ContextoValidacaoReserva;

    await assert.rejects(
      async () => await validador.validar(contextoInvalido),
      (err: unknown) => {
        assert(err instanceof BusinessRuleError);
        assert.match(err.message, /no maximo 2 reservas por dia/);
        return true;
      },
    );

    // Simula que o usuario tem apenas 1 reserva ativa no dia (nova = 2a, deve passar)
    const reservasRepoMockOk = {
      contarPorSolicitanteNoDia: async () => 1,
    };
    const contextoValido = {
      ...contextoInvalido,
      reservas: reservasRepoMockOk,
    } as unknown as ContextoValidacaoReserva;

    await assert.doesNotReject(async () => await validador.validar(contextoValido));
  });

  test("4. Tentar definir um Aluno como responsavel por uma reserva (deve falhar)", async () => {
    const validador = new ValidadorResponsavelNaoAluno();

    const usuariosRepoMock = {
      buscarResumoPorId: async (_id: string) => ({
        id: "aluno-456",
        nome: "Aluno Fulano",
        tipoCredencial: TipoCredencial.MATRICULA_ALUNO,
        ativo: true,
      }),
    };

    const contextoInvalido = {
      ator: { id: "aluno-123", tipoCredencial: TipoCredencial.MATRICULA_ALUNO },
      responsavelId: "aluno-456",
      usuarios: usuariosRepoMock,
    } as unknown as ContextoValidacaoReserva;

    await assert.rejects(
      async () => await validador.validar(contextoInvalido),
      (err: unknown) => {
        assert(err instanceof BusinessRuleError);
        assert.match(err.message, /Alunos nao podem ser definidos como responsaveis/);
        return true;
      },
    );

    // Responsavel Servidor (Docente) deve passar
    const usuariosRepoMockDocente = {
      buscarResumoPorId: async (_id: string) => ({
        id: "docente-789",
        nome: "Prof. Sicrano",
        tipoCredencial: TipoCredencial.SIAPE_DOCENTE,
        ativo: true,
      }),
    };

    const contextoValido = {
      ator: { id: "aluno-123", tipoCredencial: TipoCredencial.MATRICULA_ALUNO },
      responsavelId: "docente-789",
      usuarios: usuariosRepoMockDocente,
    } as unknown as ContextoValidacaoReserva;

    await assert.doesNotReject(async () => await validador.validar(contextoValido));
  });

  test("5. Confirmar se o status de reserva criada por Professor inicia como AGENDADO (APROVADA)", () => {
    const politicaProfessor = new PoliticaProfessorStrategy();
    const statusInicial = politicaProfessor.definirStatusInicial();

    assert.equal(politicaProfessor.nivel, NivelAcesso.PROFESSOR);
    assert.equal(statusInicial, StatusReserva.APROVADA);

    // Aluno e Tecnico devem iniciar como PENDENTE_APROVACAO (EM_ANALISE)
    const politicaAluno = new PoliticaAlunoStrategy();
    assert.equal(politicaAluno.definirStatusInicial(), StatusReserva.PENDENTE_APROVACAO);

    const politicaTecnico = new PoliticaTecnicoStrategy();
    assert.equal(politicaTecnico.definirStatusInicial(), StatusReserva.PENDENTE_APROVACAO);
  });

  test("6. Garantir que Aluno nao consiga cancelar reserva de outro usuario", async () => {
    const notificacoes = new NotificacoesService();

    // Mock do prisma para o servico
    const prismaMock = {
      reserva: {
        findUnique: async () => ({
          id: "reserva-aluno-1",
          salaId: salaMock.id,
          solicitanteId: "outro-aluno-999",
          responsavelId: "docente-100",
          dataHoraInicio: new Date("2026-10-22T10:00:00Z"),
          dataHoraFim: new Date("2026-10-22T10:50:00Z"),
          status: StatusReserva.PENDENTE_APROVACAO,
          sala: {
            predioId: salaMock.predioId,
            predio: { setorId: salaMock.setorId },
          },
        }),
      },
      lotacaoCoordenacao: {
        findMany: async () => [],
      },
    } as unknown as any;

    const cancelamentoService = new CancelamentoService({
      prisma: prismaMock,
      notificacoes,
      relogio: () => agora,
    });

    const atorAluno = { id: "meu-aluno-id", tipoCredencial: TipoCredencial.MATRICULA_ALUNO };

    await assert.rejects(
      async () => await cancelamentoService.cancelar(atorAluno, "reserva-aluno-1", "Quero cancelar"),
      (err: unknown) => {
        assert(err instanceof ForbiddenError);
        assert.match(err.message, /Alunos nao tem permissao para cancelar reservas de outros usuarios/);
        return true;
      },
    );
  });

  test("7. Verificar se a solicitacao de cancelamento feita por Professor gera notificacao para o Coordenador", async () => {
    const notificacoes = new NotificacoesService();

    const reservaAluno = {
      id: "reserva-aluno-42",
      salaId: salaMock.id,
      solicitanteId: "aluno-solicitante",
      responsavelId: "docente-responsavel",
      dataHoraInicio: new Date("2026-10-22T10:00:00Z"),
      dataHoraFim: new Date("2026-10-22T10:50:00Z"),
      status: StatusReserva.PENDENTE_APROVACAO,
      sala: {
        predioId: salaMock.predioId,
        predio: { setorId: salaMock.setorId },
      },
      solicitante: {
        id: "aluno-solicitante",
        tipoCredencial: TipoCredencial.MATRICULA_ALUNO,
      },
      responsavel: {
        id: "docente-responsavel",
        tipoCredencial: TipoCredencial.SIAPE_DOCENTE,
        departamentoId: "dep-computacao-01",
      },
    };

    const prismaMock = {
      reserva: {
        findUnique: async () => reservaAluno,
      },
      lotacaoCoordenacao: {
        findMany: async () => [], // Professor comum sem lotacao de coordenacao na sala
      },
    } as unknown as any;

    const cancelamentoService = new CancelamentoService({
      prisma: prismaMock,
      notificacoes,
      relogio: () => agora,
    });

    const atorProfessor = { id: "professor-externo", tipoCredencial: TipoCredencial.SIAPE_DOCENTE };

    const resultado = await cancelamentoService.cancelar(
      atorProfessor,
      "reserva-aluno-42",
      "Conflito de horario com aula magna",
    );

    assert.equal(resultado.solicitacaoEnviada, true);
    assert.equal(resultado.reserva, null);

    const pendentes = notificacoes.obterPendentes();
    assert.equal(pendentes.length, 1);
    assert.equal(pendentes[0].reservaId, "reserva-aluno-42");
    assert.equal(pendentes[0].solicitadoPorId, "professor-externo");
    assert.equal(pendentes[0].departamentoId, "dep-computacao-01");
    assert.equal(pendentes[0].justificativa, "Conflito de horario com aula magna");
  });
});


import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import test, { describe } from "node:test";
import express from "express";
import { DiaSemana, StatusReserva, TipoCredencial, TipoRecorrencia, type PrismaClient } from "@prisma/client";
import type { AtorAutenticado } from "../src/features/autenticacao/autenticacao.middleware.js";
import { CancelamentoService } from "../src/features/cancelamentos/cancelamento.service.js";
import { cobreSala } from "../src/features/coordenacao/domain/lotacao-coordenacao.js";
import { EscopoCoordenacaoService } from "../src/features/coordenacao/escopo-coordenacao.service.js";
import type { LotacoesRepository } from "../src/features/coordenacao/lotacoes.repository.js";
import { NotificacoesService } from "../src/features/notificacoes/notificacoes.service.js";
import { PrediosController } from "../src/features/predios/predios.controller.js";
import { criarPrediosRouter } from "../src/features/predios/predios.routes.js";
import { PrediosService } from "../src/features/predios/predios.service.js";
import { validarCriacaoPredio, validarFiltrosPredios } from "../src/features/predios/predios.validation.js";
import { DADOS_INICIAIS_PREDIOS_SALAS } from "../src/features/predios/seed/dados-iniciais-predios-salas.js";
import { semearPrediosESalasIniciais } from "../src/features/predios/seed/seed-predios-salas.js";
import { GeradorRecorrencia } from "../src/features/reservas/domain/fabrica/gerador-recorrencia.js";
import { ReservaFactory } from "../src/features/reservas/domain/fabrica/reserva.factory.js";
import { NivelAcesso } from "../src/features/reservas/domain/nivel-acesso.js";
import {
  PoliticaAlunoStrategy,
  PoliticaCoordenadorStrategy,
  PoliticaProfessorStrategy,
  PoliticaTecnicoStrategy,
} from "../src/features/reservas/domain/politicas/politica-reserva.strategy.js";
import { ResolvedorPoliticaReserva } from "../src/features/reservas/domain/politicas/resolvedor-politica.js";
import { getDiaDaSemana } from "../src/features/reservas/domain/reserva.types.js";
import {
  ValidadorAntecedencia12Horas,
  ValidadorDuracao50Minutos,
  ValidadorLimiteDiarioReservas,
  ValidadorQuota12HorasAluno,
  ValidadorResponsavelNaoAluno,
  criarPipelineValidacaoReserva,
  type ContextoValidacaoReserva,
} from "../src/features/reservas/domain/validadores/validadores-reserva.js";
import { ReservasService } from "../src/features/reservas/reservas.service.js";
import { SalasController } from "../src/features/salas/salas.controller.js";
import { construirWhereSalas, SalasRepository } from "../src/features/salas/salas.repository.js";
import { criarSalasRouter } from "../src/features/salas/salas.routes.js";
import { SalasService } from "../src/features/salas/salas.service.js";
import { validarCriacaoSala, validarFiltrosSalas } from "../src/features/salas/salas.validation.js";
import {
  BusinessRuleError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
  UnauthorizedError,
  ValidationError,
} from "../src/shared/errors/app-error.js";
import { errorHandler } from "../src/shared/http/error-handler.js";
import { carregarJanelaFuncionamento } from "../src/features/reservas/reservas.config.js";

function criarPrismaEmMemoria() {
  let seq = 1;
  const proximoObjectId = () => (seq++).toString(16).padStart(24, "0");

  interface PredioMem {
    id: string;
    nome: string;
    campusId: string | null;
    setorId: string | null;
    endereco: { rua: string; numero: number; bairro: string; cep: string } | null;
  }

  interface SalaMem {
    id: string;
    predioId: string;
    codigo: string | null;
    numSala: number | null;
    nomeSala: string;
    andar: number | null;
    capacidade: number | null;
    tipo: string | null;
    ativa: boolean;
    versaoAgenda: number;
    recursoIds: string[];
  }

  const predios = new Map<string, PredioMem>();
  const salas = new Map<string, SalaMem>();
  const reservasCountPorSala = new Map<string, number>();

  const corresponderTextoInsensitive = (valor: string, filtro?: { contains?: string; mode?: string }) => {
    if (!filtro || filtro.contains === undefined) return true;
    return valor.toLowerCase().includes(filtro.contains.toLowerCase());
  };

  const filtrarSala = (sala: SalaMem, where: Record<string, any> = {}): boolean => {
    if (where.ativa !== undefined && sala.ativa !== where.ativa) return false;
    if (where.predioId !== undefined && sala.predioId !== where.predioId) return false;
    if (where.tipo !== undefined && sala.tipo !== where.tipo) return false;
    if (where.predio?.nome) {
      const predio = predios.get(sala.predioId);
      if (!predio || !corresponderTextoInsensitive(predio.nome, where.predio.nome)) return false;
    }
    if (where.nomeSala && !corresponderTextoInsensitive(sala.nomeSala, where.nomeSala)) {
      return false;
    }
    if ("capacidade" in where) {
      const capFiltro = where.capacidade;
      if (capFiltro === null) {
        if (sala.capacidade !== null) return false;
      } else if (typeof capFiltro === "object" && capFiltro !== null) {
        if ("not" in capFiltro && capFiltro.not === null && sala.capacidade === null) return false;
        if (capFiltro.gte !== undefined && (sala.capacidade === null || sala.capacidade < capFiltro.gte)) {
          return false;
        }
        if (capFiltro.lte !== undefined && (sala.capacidade === null || sala.capacidade > capFiltro.lte)) {
          return false;
        }
      }
    }
    return true;
  };

  const anexarPredio = (sala: SalaMem) => {
    const predio = predios.get(sala.predioId)!;
    return {
      ...sala,
      predio: {
        id: predio.id,
        nome: predio.nome,
        campusId: predio.campusId,
        setorId: predio.setorId,
      },
    };
  };

  const db = {
    predio: {
      findUnique: async ({ where, select }: any) => {
        let encontrado: PredioMem | undefined;
        if (where.id) encontrado = predios.get(where.id);
        else if (where.nome) {
          encontrado = [...predios.values()].find((p) => p.nome === where.nome);
        }
        if (!encontrado) return null;
        if (select?.salas) {
          const whereSalas = select.salas.where ?? {};
          const salasDoPredio = [...salas.values()]
            .filter((s) => s.predioId === encontrado!.id && filtrarSala(s, whereSalas))
            .sort((a, b) => a.nomeSala.localeCompare(b.nomeSala));
          return { ...encontrado, salas: salasDoPredio };
        }
        return { ...encontrado };
      },
      findMany: async ({ where = {}, select }: any = {}) => {
        const lista = [...predios.values()]
          .filter((p) => corresponderTextoInsensitive(p.nome, where.nome))
          .sort((a, b) => a.nome.localeCompare(b.nome));

        if (select?.salas) {
          const whereSalas = select.salas.where ?? {};
          return lista.map((p) => ({
            ...p,
            salas: [...salas.values()]
              .filter((s) => s.predioId === p.id && filtrarSala(s, whereSalas))
              .sort((a, b) => a.nomeSala.localeCompare(b.nomeSala)),
          }));
        }
        return lista.map((p) => ({ ...p }));
      },
      create: async ({ data }: any) => {
        const duplicado = [...predios.values()].find((p) => p.nome === data.nome);
        if (duplicado) throw new Error("Unique constraint failed on the constraint: `Predio_nome_key`");
        const novo: PredioMem = {
          id: proximoObjectId(),
          nome: data.nome,
          campusId: data.campusId ?? null,
          setorId: data.setorId ?? null,
          endereco: data.endereco ?? null,
        };
        predios.set(novo.id, novo);
        return { ...novo };
      },
      update: async ({ where, data }: any) => {
        const atual = predios.get(where.id);
        if (!atual) throw new Error("Record not found");
        const atualizado: PredioMem = {
          ...atual,
          ...(data.nome !== undefined ? { nome: data.nome } : {}),
          ...(data.campusId !== undefined ? { campusId: data.campusId } : {}),
          ...(data.setorId !== undefined ? { setorId: data.setorId } : {}),
          ...(data.endereco !== undefined ? { endereco: data.endereco } : {}),
        };
        predios.set(atualizado.id, atualizado);
        return { ...atualizado };
      },
      delete: async ({ where }: any) => {
        predios.delete(where.id);
      },
    },
    sala: {
      findUnique: async ({ where }: any) => {
        let encontrada: SalaMem | undefined;
        if (where.id) {
          encontrada = salas.get(where.id);
        } else if (where.predioId_nomeSala) {
          const { predioId, nomeSala } = where.predioId_nomeSala;
          encontrada = [...salas.values()].find(
            (s) => s.predioId === predioId && s.nomeSala === nomeSala,
          );
        }
        if (!encontrada) return null;
        return anexarPredio(encontrada);
      },
      findMany: async ({ where = {} }: any = {}) => {
        return [...salas.values()]
          .filter((s) => filtrarSala(s, where))
          .sort((a, b) =>
            a.predioId === b.predioId
              ? a.nomeSala.localeCompare(b.nomeSala)
              : a.predioId.localeCompare(b.predioId),
          )
          .map(anexarPredio);
      },
      create: async ({ data }: any) => {
        const duplicada = [...salas.values()].find(
          (s) => s.predioId === data.predioId && s.nomeSala === data.nomeSala,
        );
        if (duplicada) {
          throw new Error("Unique constraint failed on the constraint: `Sala_predioId_nomeSala_key`");
        }
        const nova: SalaMem = {
          id: proximoObjectId(),
          predioId: data.predioId,
          codigo: data.codigo ?? null,
          numSala: data.numSala ?? null,
          nomeSala: data.nomeSala,
          andar: data.andar ?? null,
          capacidade: data.capacidade ?? null,
          tipo: data.tipo ?? null,
          ativa: data.ativa ?? true,
          versaoAgenda: 0,
          recursoIds: [],
        };
        salas.set(nova.id, nova);
        return anexarPredio(nova);
      },
      update: async ({ where, data }: any) => {
        const atual = salas.get(where.id);
        if (!atual) throw new Error("Record not found");
        const atualizada: SalaMem = {
          ...atual,
          ...(data.predioId !== undefined ? { predioId: data.predioId } : {}),
          ...(data.nomeSala !== undefined ? { nomeSala: data.nomeSala } : {}),
          ...(data.capacidade !== undefined ? { capacidade: data.capacidade } : {}),
          ...(data.codigo !== undefined ? { codigo: data.codigo } : {}),
          ...(data.numSala !== undefined ? { numSala: data.numSala } : {}),
          ...(data.andar !== undefined ? { andar: data.andar } : {}),
          ...(data.tipo !== undefined ? { tipo: data.tipo } : {}),
          ...(data.ativa !== undefined ? { ativa: data.ativa } : {}),
          ...(data.versaoAgenda?.increment
            ? { versaoAgenda: atual.versaoAgenda + data.versaoAgenda.increment }
            : {}),
        };
        salas.set(atualizada.id, atualizada);
        return anexarPredio(atualizada);
      },
      count: async ({ where }: any) => {
        return [...salas.values()].filter((s) =>
          where?.predioId ? s.predioId === where.predioId : true,
        ).length;
      },
      delete: async ({ where }: any) => {
        salas.delete(where.id);
      },
    },
    reserva: {
      count: async ({ where }: any) => {
        return reservasCountPorSala.get(where.salaId) ?? 0;
      },
    },
    definirReservasDaSala(salaId: string, quantidade: number) {
      reservasCountPorSala.set(salaId, quantidade);
    },
  };

  return db as unknown as PrismaClient & { definirReservasDaSala: (id: string, qtd: number) => void };
}

const atorCoordenador: AtorAutenticado = {
  id: "64b7f0c2a1b2c3d4e5f60001",
  nome: "Coordenador Geral",
  tipoCredencial: TipoCredencial.SIAPE_DOCENTE,
  nivelAcesso: NivelAcesso.COORDENADOR,
  departamentoId: "64b7f0c2a1b2c3d4e5f60099",
};

const atorProfessor: AtorAutenticado = {
  id: "64b7f0c2a1b2c3d4e5f60002",
  nome: "Professor",
  tipoCredencial: TipoCredencial.SIAPE_DOCENTE,
  nivelAcesso: NivelAcesso.PROFESSOR,
  departamentoId: "64b7f0c2a1b2c3d4e5f60099",
};

const atorAluno: AtorAutenticado = {
  id: "64b7f0c2a1b2c3d4e5f60003",
  nome: "Aluno",
  tipoCredencial: TipoCredencial.MATRICULA_ALUNO,
  nivelAcesso: NivelAcesso.ALUNO,
  departamentoId: null,
};

describe("Predios e Salas — Dataset Inicial, Seed Idempotente, Consultas e Regras", () => {
  test("1. Dataset inicial contem exatamente os 7 predios e 59 salas em portugues, preservando grafia e capacidades nulas", () => {
    assert.equal(DADOS_INICIAIS_PREDIOS_SALAS.length, 7);

    const nomesPredios = DADOS_INICIAIS_PREDIOS_SALAS.map((p) => p.nome);
    assert.deepEqual(nomesPredios, [
      "Prédio Administrativo",
      "Prédio Centro Tecnológico CT",
      "Prédio de Biologia",
      "Prédio Pedagógico PP",
      "Prédio TI",
      "Salas Ambiente",
      "Complexo de Laoratório",
    ]);

    const todasSalas = DADOS_INICIAIS_PREDIOS_SALAS.flatMap((p) =>
      p.salas.map((s) => ({ predio: p.nome, ...s })),
    );
    assert.equal(todasSalas.length, 59);

    const semCapacidade = todasSalas.filter((s) => s.capacidade === null);
    assert.deepEqual(
      semCapacidade.map((s) => `${s.predio} -> ${s.nome}`),
      [
        "Prédio Pedagógico PP -> Sala 11 PP",
        "Prédio Pedagógico PP -> Sala 12 PP",
        "Complexo de Laoratório -> Lab. da Ciência do Café",
      ],
    );

    const comCapacidadeZero = todasSalas.filter((s) => s.capacidade === 0);
    assert.equal(comCapacidadeZero.length, 0);
  });

  test("2. Seed inicial e idempotente: primeira execucao cria 7 predios e 59 salas; segunda execucao nao cria duplicatas", async () => {
    const prisma = criarPrismaEmMemoria();

    const primeira = await semearPrediosESalasIniciais(prisma);
    assert.equal(primeira.prediosProcessados, 7);
    assert.equal(primeira.prediosCriados, 7);
    assert.equal(primeira.prediosExistentes, 0);
    assert.equal(primeira.salasProcessadas, 59);
    assert.equal(primeira.salasCriadas, 59);
    assert.equal(primeira.salasExistentes, 0);

    const segunda = await semearPrediosESalasIniciais(prisma);
    assert.equal(segunda.prediosProcessados, 7);
    assert.equal(segunda.prediosCriados, 0);
    assert.equal(segunda.prediosExistentes, 7);
    assert.equal(segunda.salasProcessadas, 59);
    assert.equal(segunda.salasCriadas, 0);
    assert.equal(segunda.salasExistentes, 59);

    const prediosService = new PrediosService({ prisma });
    const predios = await prediosService.listar({ incluirSalas: true });
    assert.equal(predios.length, 7);
  });

  test("3. Salas com nomes identicos em predios diferentes (ex.: 'Lab. de Física' e 'Sala 01') sao identificadas corretamente", async () => {
    const prisma = criarPrismaEmMemoria();
    await semearPrediosESalasIniciais(prisma);

    const salasService = new SalasService({ prisma });
    const prediosService = new PrediosService({ prisma });

    const labsFisica = await salasService.listar({ nome: "Lab. de Física" });
    assert.equal(labsFisica.length, 2);

    const porPredio = new Map(labsFisica.map((s) => [s.predio.nome, s]));
    const labTi = porPredio.get("Prédio TI");
    const labComplexo = porPredio.get("Complexo de Laoratório");

    assert(labTi);
    assert(labComplexo);
    assert.notEqual(labTi.id, labComplexo.id);
    assert.equal(labTi.capacidade, 16);
    assert.equal(labComplexo.capacidade, 20);

    const predioBio = (await prediosService.listar({ nome: "Prédio de Biologia" }))[0]!;
    await assert.rejects(
      async () =>
        salasService.criar(atorCoordenador, {
          predioId: predioBio.id,
          nomeSala: "Sala 01",
          capacidade: 40,
        }),
      (err: unknown) => err instanceof ConflictError,
    );

    const novoPredio = await prediosService.criar(atorCoordenador, { nome: "Prédio Anexo" });
    const novaSala01 = await salasService.criar(atorCoordenador, {
      predioId: novoPredio.id,
      nomeSala: "Sala 01",
      capacidade: 25,
    });
    assert.equal(novaSala01.nome, "Sala 01");
    assert.equal(novaSala01.predio.nome, "Prédio Anexo");
  });

  test("4. Busca e filtragem de salas por predio, nome e capacidade (incluindo tratamento de capacidade null)", async () => {
    const prisma = criarPrismaEmMemoria();
    await semearPrediosESalasIniciais(prisma);

    const salasService = new SalasService({ prisma });
    const prediosService = new PrediosService({ prisma });

    const grandes = await salasService.listar({ capacidadeMin: 60 });
    assert.equal(grandes.length, 2);
    assert.deepEqual(
      grandes.map((s) => s.nome).sort(),
      ["Auditório I PP", "Auditório II"],
    );

    const pequenas = await salasService.listar({ capacidadeMin: 9, capacidadeMax: 16 });
    assert.equal(pequenas.length, 3);
    assert(pequenas.every((s) => s.capacidade !== null && s.capacidade >= 9 && s.capacidade <= 16));

    const naoEspecificadas = await salasService.listar({ semCapacidade: true });
    assert.equal(naoEspecificadas.length, 3);
    assert(naoEspecificadas.every((s) => s.capacidade === null));

    const [predioPP] = await prediosService.listar({ nome: "Prédio Pedagógico PP" });
    assert(predioPP);
    const todasSalasPP = await prediosService.listarSalasDoPredio(predioPP.id);
    assert.equal(todasSalasPP.length, 13);

    const salasPPComCapacidade = await prediosService.listarSalasDoPredio(predioPP.id, {
      apenasComCapacidade: true,
    });
    assert.equal(salasPPComCapacidade.length, 11);

    const predioDetalhado = await prediosService.buscarPorId(predioPP.id);
    assert.equal(predioDetalhado.nome, "Prédio Pedagógico PP");
    assert.equal(predioDetalhado.salas.length, 13);
  });

  test("5. Validacoes de entrada, permissoes de escrita (COORDENADOR) e integridade referencial na exclusao", async () => {
    const prisma = criarPrismaEmMemoria();
    await semearPrediosESalasIniciais(prisma);

    const salasService = new SalasService({ prisma });
    const prediosService = new PrediosService({ prisma });

    assert.throws(
      () =>
        validarCriacaoSala({
          predioId: "64b7f0c2a1b2c3d4e5f60718",
          nome: "Sala Teste",
          capacidade: 0,
        }),
      (err: unknown) => err instanceof ValidationError,
    );

    assert.throws(
      () => validarFiltrosSalas({ capacidadeMin: "30", capacidadeMax: "10" }),
      (err: unknown) => err instanceof ValidationError,
    );

    assert.throws(
      () => validarFiltrosPredios({ incluirSalas: "invalido" }),
      (err: unknown) => err instanceof ValidationError,
    );

    assert.throws(
      () => validarCriacaoPredio({ nome: "   " }),
      (err: unknown) => err instanceof ValidationError,
    );

    await assert.rejects(
      async () => prediosService.criar(atorProfessor, { nome: "Prédio Novo" }),
      (err: unknown) => err instanceof ForbiddenError,
    );
    await assert.rejects(
      async () =>
        salasService.criar(atorAluno, {
          predioId: "64b7f0c2a1b2c3d4e5f60718",
          nomeSala: "Sala X",
          capacidade: 20,
        }),
      (err: unknown) => err instanceof ForbiddenError,
    );

    const [predioAdmin] = await prediosService.listar({ nome: "Prédio Administrativo" });
    assert(predioAdmin);
    await assert.rejects(
      async () => prediosService.remover(atorCoordenador, predioAdmin.id),
      (err: unknown) => err instanceof BusinessRuleError,
    );

    const [auditorio] = await prediosService.listarSalasDoPredio(predioAdmin.id, {
      nome: "Auditório II",
    });
    assert(auditorio);
    prisma.definirReservasDaSala(auditorio.id, 1);
    await assert.rejects(
      async () => salasService.remover(atorCoordenador, auditorio.id),
      (err: unknown) => err instanceof BusinessRuleError,
    );

    await assert.rejects(
      async () => prediosService.buscarPorId("64b7f0c2a1b2c3d4e5f69999"),
      (err: unknown) => err instanceof NotFoundError,
    );
    await assert.rejects(
      async () => salasService.buscarPorId("64b7f0c2a1b2c3d4e5f69999"),
      (err: unknown) => err instanceof NotFoundError,
    );
  });

  test("6. Integracao com dominio de Reservas e Escopo de Coordenacao (predios com setorId null)", async () => {
    const prisma = criarPrismaEmMemoria();
    await semearPrediosESalasIniciais(prisma);

    const salasRepo = new SalasRepository(prisma);
    const salasService = new SalasService({ prisma });
    const [salaTi] = await salasService.listar({
      predioNome: "Prédio TI",
      nome: "Lab. de Robótica",
    });
    assert(salaTi);

    const salaParaReserva = await salasRepo.buscarParaReserva(salaTi.id);
    assert(salaParaReserva);
    assert.equal(salaParaReserva.predioId, salaTi.predioId);
    assert.equal(salaParaReserva.setorId, null);
    assert.equal(salaParaReserva.capacidade, 9);
    assert.equal(salaParaReserva.ativa, true);

    assert.equal(
      cobreSala(
        {
          predioId: salaTi.predioId,
          setorId: null,
          dataInicio: new Date("2026-01-01T00:00:00Z"),
          dataFim: null,
          ativo: true,
        },
        salaParaReserva,
      ),
      true,
    );

    assert.equal(
      cobreSala(
        {
          predioId: "64b7f0c2a1b2c3d4e5f68888",
          setorId: null,
          dataInicio: new Date("2026-01-01T00:00:00Z"),
          dataFim: null,
          ativo: true,
        },
        salaParaReserva,
      ),
      false,
    );

    const where = construirWhereSalas({
      predioId: salaTi.predioId,
      nome: "Lab",
      capacidadeMin: 10,
      capacidadeMax: 30,
    });
    assert.deepEqual(where, {
      ativa: true,
      predioId: salaTi.predioId,
      nomeSala: { contains: "Lab", mode: "insensitive" },
      capacidade: { not: null, gte: 10, lte: 30 },
    });
  });
});

describe("Regras de Negocio de Reservas e Cancelamentos (Preservacao e Integracao)", () => {
  const agora = new Date("2026-10-20T08:00:00Z");
  const salaMock = {
    id: "60d5ec49f1b2c8b1f8e4e1a1",
    codigo: null,
    nomeSala: "Sala 01 CT",
    capacidade: 40,
    ativa: true,
    predioId: "60d5ec49f1b2c8b1f8e4e1a2",
    setorId: null,
  };

  test("7. Duracao exata de 50 minutos, antecedencia minima de 12h (Aluno/Tecnico) e bloqueio de Aluno como responsavel", async () => {
    const validadorDuracao = new ValidadorDuracao50Minutos();
    const inicio = new Date("2026-10-21T13:00:00Z");
    const fim60 = new Date("2026-10-21T14:00:00Z");
    const fim50 = new Date("2026-10-21T13:50:00Z");

    await assert.rejects(
      async () => validadorDuracao.validar({ ocorrencias: [{ inicio, fim: fim60 }] } as unknown as ContextoValidacaoReserva),
      (err: unknown) => err instanceof BusinessRuleError,
    );
    await assert.doesNotReject(async () =>
      validadorDuracao.validar({ ocorrencias: [{ inicio, fim: fim50 }] } as unknown as ContextoValidacaoReserva),
    );

    const validadorAntecedencia = new ValidadorAntecedencia12Horas();
    const inicioProximo = new Date(agora.getTime() + 6 * 60 * 60 * 1000);
    await assert.rejects(
      async () =>
        validadorAntecedencia.validar({
          agora,
          politica: new PoliticaAlunoStrategy(),
          ocorrencias: [{ inicio: inicioProximo, fim: new Date(inicioProximo.getTime() + 50 * 60 * 1000) }],
        } as unknown as ContextoValidacaoReserva),
      (err: unknown) => err instanceof BusinessRuleError,
    );

    const validadorResponsavel = new ValidadorResponsavelNaoAluno();
    await assert.rejects(
      async () =>
        validadorResponsavel.validar({
          ator: atorAluno,
          comando: { responsavelId: "aluno-2" },
          usuarios: {
            buscarResumoPorId: async () => ({
              id: "aluno-2",
              ativo: true,
              tipoCredencial: TipoCredencial.MATRICULA_ALUNO,
            }),
          },
        } as unknown as ContextoValidacaoReserva),
      (err: unknown) => err instanceof BusinessRuleError,
    );
  });

  test("8. Limite de 2 reservas a cada 12h e 2 por dia para Aluno/Tecnico, status inicial por perfil e recorrencia", async () => {
    assert.equal(new PoliticaProfessorStrategy().definirStatusInicial(), StatusReserva.AGENDADO);
    assert.equal(new PoliticaCoordenadorStrategy().definirStatusInicial(), StatusReserva.APROVADA);
    assert.equal(new PoliticaAlunoStrategy().definirStatusInicial(), StatusReserva.PENDENTE_APROVACAO);
    assert.equal(new PoliticaTecnicoStrategy().definirStatusInicial(), StatusReserva.PENDENTE_APROVACAO);

    const validadorQuota12h = new ValidadorQuota12HorasAluno();
    await assert.doesNotReject(async () =>
      validadorQuota12h.validar({
        agora,
        ator: atorAluno,
        politica: new PoliticaAlunoStrategy(),
        ocorrencias: [{ inicio: new Date("2026-10-21T13:00:00Z"), fim: new Date("2026-10-21T13:50:00Z") }],
        usuarios: { incrementarVersaoSolicitacoes: async () => {} },
        reservas: { contarAtivasPorSolicitanteDesde: async () => 1 },
      } as unknown as ContextoValidacaoReserva),
    );
    await assert.rejects(
      async () =>
        validadorQuota12h.validar({
          agora,
          ator: atorAluno,
          politica: new PoliticaAlunoStrategy(),
          ocorrencias: [{ inicio: new Date("2026-10-21T13:00:00Z"), fim: new Date("2026-10-21T13:50:00Z") }],
          usuarios: { incrementarVersaoSolicitacoes: async () => {} },
          reservas: { contarAtivasPorSolicitanteDesde: async () => 2 },
        } as unknown as ContextoValidacaoReserva),
      (err: unknown) => err instanceof BusinessRuleError,
    );

    const validadorDiario = new ValidadorLimiteDiarioReservas();
    await assert.rejects(
      async () =>
        validadorDiario.validar({
          ator: atorAluno,
          politica: new PoliticaAlunoStrategy(),
          ocorrencias: [{ inicio: new Date("2026-10-21T13:00:00Z"), fim: new Date("2026-10-21T13:50:00Z") }],
          reservas: { contarPorSolicitanteNoDia: async () => 2 },
        } as unknown as ContextoValidacaoReserva),
      (err: unknown) => err instanceof BusinessRuleError,
    );

    const inicioQuarta = new Date("2026-10-21T13:00:00-03:00");
    const fimQuarta = new Date("2026-10-21T13:50:00-03:00");
    assert.equal(getDiaDaSemana(inicioQuarta), DiaSemana.QUARTA);

    const gerador = new GeradorRecorrencia();
    const ocorrenciasMensais = gerador.gerar(
      { inicio: inicioQuarta, fim: fimQuarta },
      {
        tipo: TipoRecorrencia.MENSAL,
        diasSemana: [],
      },
    );
    assert(ocorrenciasMensais.length >= 4);
    assert(ocorrenciasMensais.every((o) => getDiaDaSemana(o.inicio) === DiaSemana.QUARTA));
  });

  test("9. Fluxo de reserva e cancelamento com sala de predio sem setorId (inativa bloqueia; professor agenda; cancelamento respeita inicio)", async () => {
    const notificacoes = new NotificacoesService();
    const escopo = new EscopoCoordenacaoService({
      listarAtivasDoDocente: async () => [
        {
          predioId: salaMock.predioId,
          setorId: null,
          dataInicio: new Date("2026-01-01T00:00:00Z"),
          dataFim: null,
          ativo: true,
        },
      ],
    } as unknown as LotacoesRepository);

    const prismaSalaInativa = {
      sala: {
        findUnique: async () => ({
          ...salaMock,
          ativa: false,
          predio: { setorId: null },
        }),
      },
    } as unknown as PrismaClient;

    const reservasServiceInativa = new ReservasService({
      prisma: prismaSalaInativa,
      resolvedor: new ResolvedorPoliticaReserva(escopo),
      pipeline: criarPipelineValidacaoReserva(carregarJanelaFuncionamento()),
      factory: new ReservaFactory(),
      notificacoes,
      relogio: () => agora,
    });

    await assert.rejects(
      async () =>
        reservasServiceInativa.criar(atorProfessor, {
          salaId: salaMock.id,
          dataHoraInicio: new Date("2026-10-21T13:00:00-03:00"),
          dataHoraFim: new Date("2026-10-21T13:50:00-03:00"),
          finalidade: "Aula",
        }),
      (err: unknown) => err instanceof BusinessRuleError && /inativa/.test(err.message),
    );

    const cancelamentoService = new CancelamentoService({
      prisma: {
        lotacaoCoordenacao: {
          findMany: async () => [],
        },
        reserva: {
          findUnique: async () => ({
            id: "64b7f0c2a1b2c3d4e5f60111",
            salaId: salaMock.id,
            solicitanteId: atorProfessor.id,
            responsavelId: atorProfessor.id,
            status: StatusReserva.APROVADA,
            dataHoraInicio: new Date("2026-10-20T07:00:00Z"),
            dataHoraFim: new Date("2026-10-20T07:50:00Z"),
            sala: { predioId: salaMock.predioId, predio: { setorId: null } },
            solicitante: { id: atorProfessor.id, tipoCredencial: TipoCredencial.SIAPE_DOCENTE },
            responsavel: { id: atorProfessor.id, tipoCredencial: TipoCredencial.SIAPE_DOCENTE, departamentoId: "dep-1" },
          }),
        },
      } as unknown as PrismaClient,
      notificacoes,
      relogio: () => agora,
    });

    await assert.rejects(
      async () =>
        cancelamentoService.cancelar(
          atorProfessor,
          "64b7f0c2a1b2c3d4e5f60111",
          "Imprevisto",
        ),
      (err: unknown) => err instanceof BusinessRuleError,
    );
  });

  test("10. Rotas HTTP /predios e /salas: listagem, filtros, seed idempotente e codigos de status", async () => {
    const prisma = criarPrismaEmMemoria();
    const prediosService = new PrediosService({ prisma });
    const salasService = new SalasService({ prisma });

    const autenticarMock: express.RequestHandler = (req, _res, next) => {
      const perfil = req.header("x-perfil-teste");
      if (!perfil) throw new UnauthorizedError("Token ausente.");
      req.ator = perfil === "COORDENADOR" ? atorCoordenador : atorProfessor;
      next();
    };

    const app = express();
    app.use(express.json());
    app.use("/predios", criarPrediosRouter(new PrediosController(prediosService), autenticarMock));
    app.use("/salas", criarSalasRouter(new SalasController(salasService), autenticarMock));
    app.use(errorHandler);

    const server = app.listen(0);
    const { port } = server.address() as AddressInfo;
    const baseUrl = `http://127.0.0.1:${port}`;

    try {
      const resSeed = await fetch(`${baseUrl}/predios/seed`, {
        method: "POST",
        headers: { "x-perfil-teste": "COORDENADOR" },
      });
      assert.equal(resSeed.status, 200);
      const bodySeed = (await resSeed.json()) as any;
      assert.equal(bodySeed.prediosCriados, 7);
      assert.equal(bodySeed.salasCriadas, 59);

      const resPredios = await fetch(`${baseUrl}/predios`);
      assert.equal(resPredios.status, 200);
      const predios = (await resPredios.json()) as any[];
      assert.equal(predios.length, 7);

      const predioPP = predios.find((p) => p.nome === "Prédio Pedagógico PP");
      assert(predioPP);
      const resSalasPP = await fetch(`${baseUrl}/predios/${predioPP.id}/salas?capacidadeMin=33`);
      assert.equal(resSalasPP.status, 200);
      const salasPP = (await resSalasPP.json()) as any[];
      assert(salasPP.length > 0);
      assert(salasPP.every((s) => s.predioId === predioPP.id && s.capacidade !== null && s.capacidade >= 33));

      const resFisica = await fetch(
        `${baseUrl}/salas?nome=${encodeURIComponent("Lab. de Física")}`,
      );
      assert.equal(resFisica.status, 200);
      const salasFisica = (await resFisica.json()) as any[];
      assert.equal(salasFisica.length, 2);

      const resProibido = await fetch(`${baseUrl}/salas`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-perfil-teste": "PROFESSOR",
        },
        body: JSON.stringify({ predioId: predioPP.id, nome: "Nova Sala", capacidade: 30 }),
      });
      assert.equal(resProibido.status, 403);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
});

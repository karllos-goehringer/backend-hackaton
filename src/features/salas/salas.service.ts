import type { PrismaClient } from "@prisma/client";
import {
  BusinessRuleError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
} from "../../shared/errors/app-error.js";
import type { AtorAutenticado } from "../autenticacao/autenticacao.middleware.js";
import { estaAtiva, type LotacaoCoordenacaoDados } from "../coordenacao/domain/lotacao-coordenacao.js";
import { PrediosRepository } from "../predios/predios.repository.js";
import { NivelAcesso } from "../reservas/domain/nivel-acesso.js";
import {
  SalasRepository,
  type AtualizarSalaDados,
  type CriarSalaDados,
  type FiltrosBuscaSalas,
  type SalaComPredio,
} from "./salas.repository.js";

export interface DependenciasSalasService {
  prisma: PrismaClient;
}

export class SalasService {
  private readonly prisma: PrismaClient;

  constructor(deps: DependenciasSalasService) {
    this.prisma = deps.prisma;
  }

  async listar(filtros: FiltrosBuscaSalas = {}): Promise<SalaComPredio[]> {
    return new SalasRepository(this.prisma).listar(filtros);
  }

  async buscarPorId(id: string): Promise<SalaComPredio> {
    const sala = await new SalasRepository(this.prisma).buscarPorId(id);
    if (!sala) throw new NotFoundError("Sala nao encontrada.");
    return sala;
  }

  async criar(ator: AtorAutenticado, dados: CriarSalaDados): Promise<SalaComPredio> {
    this.garantirPermissaoCoordenador(ator);

    const predios = new PrediosRepository(this.prisma);
    const salas = new SalasRepository(this.prisma);

    const predio = await predios.buscarResumoPorId(dados.predioId);
    if (!predio) throw new NotFoundError("Predio nao encontrado.");



    const duplicada = await salas.buscarPorPredioENome(dados.predioId, dados.nomeSala);
    if (duplicada) {
      throw new ConflictError(
        `Ja existe uma sala com o nome "${dados.nomeSala}" no predio "${predio.nome}".`,
      );
    }

    return salas.criar(dados);
  }

  async atualizar(
    ator: AtorAutenticado,
    id: string,
    dados: AtualizarSalaDados,
  ): Promise<SalaComPredio> {
    this.garantirPermissaoCoordenador(ator);

    const predios = new PrediosRepository(this.prisma);
    const salas = new SalasRepository(this.prisma);

    const atual = await salas.buscarPorId(id);
    if (!atual) throw new NotFoundError("Sala nao encontrada.");



    const predioIdAlvo = dados.predioId ?? atual.predioId;
    const nomeSalaAlvo = dados.nomeSala ?? atual.nomeSala;

    let nomePredioAlvo = atual.predio.nome;
    if (dados.predioId && dados.predioId !== atual.predioId) {
      const novoPredio = await predios.buscarResumoPorId(dados.predioId);
      if (!novoPredio) throw new NotFoundError("Predio nao encontrado.");
  
      nomePredioAlvo = novoPredio.nome;
    }

    if (predioIdAlvo !== atual.predioId || nomeSalaAlvo !== atual.nomeSala) {
      const existente = await salas.buscarPorPredioENome(predioIdAlvo, nomeSalaAlvo);
      if (existente && existente.id !== id) {
        throw new ConflictError(
          `Ja existe uma sala com o nome "${nomeSalaAlvo}" no predio "${nomePredioAlvo}".`,
        );
      }
    }

    return salas.atualizar(id, dados);
  }

  async remover(ator: AtorAutenticado, id: string): Promise<void> {
    this.garantirPermissaoCoordenador(ator);

    const salas = new SalasRepository(this.prisma);
    const atual = await salas.buscarPorId(id);
    if (!atual) throw new NotFoundError("Sala nao encontrada.");



    const totalReservas = await salas.contarReservasPorSala(id);
    if (totalReservas > 0) {
      throw new BusinessRuleError(
        "Nao e possivel remover uma sala que possui historico de reservas. Inative a sala (ativa: false).",
      );
    }

    await salas.remover(id);
  }

  private garantirPermissaoCoordenador(ator: AtorAutenticado): void {
    if (ator.nivelAcesso !== NivelAcesso.COORDENADOR) {
      throw new ForbiddenError("Apenas coordenadores podem cadastrar, alterar ou remover salas.");
    }
  }

  private async garantirEscopoPredioCoordenador(ator: AtorAutenticado, predioId: string): Promise<void> {
    const delegate = (this.prisma as PrismaClient & {
      lotacaoCoordenacao?: {
        findMany?: (args: unknown) => Promise<LotacaoCoordenacaoDados[]>;
      };
    }).lotacaoCoordenacao;
    if (!delegate || typeof delegate.findMany !== "function") return;

    const lotacoes = await delegate.findMany({
      where: { docenteId: ator.id },
      select: { predioId: true, ativo: true },
    });
    const ativas = lotacoes.filter((l) => estaAtiva(l));
    if (ativas.length > 0 && !ativas.some((l) => l.predioId === predioId)) {
      throw new ForbiddenError(
        "Apenas o coordenador vinculado ao predio desta sala pode gerencia-la.",
      );
    }
  }
}

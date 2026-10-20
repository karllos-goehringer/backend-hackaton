import type { PrismaClient } from "@prisma/client";
import {
  BusinessRuleError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
} from "../../shared/errors/app-error.js";
import type { AtorAutenticado } from "../autenticacao/autenticacao.middleware.js";
import { estaAtiva, type LotacaoCoordenacaoDados } from "../coordenacao/domain/lotacao-coordenacao.js";
import { NivelAcesso } from "../reservas/domain/nivel-acesso.js";
import {
  SalasRepository,
  type FiltrosBuscaSalas,
  type SalaComPredio,
} from "../salas/salas.repository.js";
import {
  PrediosRepository,
  type AtualizarPredioDados,
  type CriarPredioDados,
  type FiltrosListagemPredios,
  type PredioComSalas,
  type PredioResumo,
} from "./predios.repository.js";
import {
  semearPrediosESalasIniciais,
  type ResultadoSeedPrediosSalas,
} from "./seed/seed-predios-salas.js";

export interface DependenciasPrediosService {
  prisma: PrismaClient;
}

export class PrediosService {
  private readonly prisma: PrismaClient;

  constructor(deps: DependenciasPrediosService) {
    this.prisma = deps.prisma;
  }

  async listar(filtros: FiltrosListagemPredios = {}): Promise<(PredioResumo | PredioComSalas)[]> {
    return new PrediosRepository(this.prisma).listar(filtros);
  }

  async buscarPorId(
    id: string,
    opcoes: { incluirInativas?: boolean } = {},
  ): Promise<PredioComSalas> {
    const predio = await new PrediosRepository(this.prisma).buscarPorIdComSalas(id, opcoes);
    if (!predio) throw new NotFoundError("Predio nao encontrado.");
    return predio;
  }

  async listarSalasDoPredio(
    predioId: string,
    filtros: Omit<FiltrosBuscaSalas, "predioId"> = {},
  ): Promise<SalaComPredio[]> {
    const predios = new PrediosRepository(this.prisma);
    const predio = await predios.buscarResumoPorId(predioId);
    if (!predio) throw new NotFoundError("Predio nao encontrado.");

    return new SalasRepository(this.prisma).listar({
      ...filtros,
      predioId,
    });
  }

  async criar(ator: AtorAutenticado, dados: CriarPredioDados): Promise<PredioResumo> {
    this.garantirPermissaoCoordenador(ator);

    const predios = new PrediosRepository(this.prisma);
    const existente = await predios.buscarPorNome(dados.nome);
    if (existente) {
      throw new ConflictError(`Ja existe um predio com o nome "${dados.nome}".`);
    }

    return predios.criar(dados);
  }

  async atualizar(
    ator: AtorAutenticado,
    id: string,
    dados: AtualizarPredioDados,
  ): Promise<PredioResumo> {
    this.garantirPermissaoCoordenador(ator);

    const predios = new PrediosRepository(this.prisma);
    const atual = await predios.buscarResumoPorId(id);
    if (!atual) throw new NotFoundError("Predio nao encontrado.");

    await this.garantirEscopoPredioCoordenador(ator, id);

    if (dados.nome !== undefined && dados.nome !== atual.nome) {
      const duplicado = await predios.buscarPorNome(dados.nome);
      if (duplicado && duplicado.id !== id) {
        throw new ConflictError(`Ja existe um predio com o nome "${dados.nome}".`);
      }
    }

    return predios.atualizar(id, dados);
  }

  async remover(ator: AtorAutenticado, id: string): Promise<void> {
    this.garantirPermissaoCoordenador(ator);

    const predios = new PrediosRepository(this.prisma);
    const atual = await predios.buscarResumoPorId(id);
    if (!atual) throw new NotFoundError("Predio nao encontrado.");

    await this.garantirEscopoPredioCoordenador(ator, id);

    const totalSalas = await predios.contarSalasPorPredio(id);
    if (totalSalas > 0) {
      throw new BusinessRuleError(
        "Nao e possivel remover um predio que possui salas associadas.",
      );
    }

    await predios.remover(id);
  }

  async semearDadosIniciais(ator: AtorAutenticado): Promise<ResultadoSeedPrediosSalas> {
    this.garantirPermissaoCoordenador(ator);
    return semearPrediosESalasIniciais(this.prisma);
  }

  private garantirPermissaoCoordenador(ator: AtorAutenticado): void {
    if (ator.nivelAcesso !== NivelAcesso.COORDENADOR) {
      throw new ForbiddenError("Apenas coordenadores podem cadastrar, alterar ou remover predios.");
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
      select: { predioId: true, setorId: true, ativo: true },
    });
    const ativas = lotacoes.filter((l) => estaAtiva(l));
    if (ativas.length > 0 && !ativas.some((l) => l.predioId === predioId)) {
      throw new ForbiddenError(
        "Apenas o coordenador vinculado a este predio pode alterar ou remover o predio.",
      );
    }
  }
}

import type { PrismaClient } from "@prisma/client";
import { TipoCredencial } from "@prisma/client";
import { BusinessRuleError, ForbiddenError, NotFoundError, ValidationError } from "../../shared/errors/app-error.js";
import { ehObjectId } from "../../shared/validation/object-id.js";
import type { AtorAutenticado } from "../autenticacao/autenticacao.middleware.js";
import { NivelAcesso } from "../usuarios/nivel-acesso.js";
import { LotacoesRepository, type LotacaoCoordenacaoDetalhada } from "./lotacoes.repository.js";
import type {
  AtualizarCoordenacaoInput,
  CriarCoordenacaoInput,
  FiltrosListagemCoordenacao,
  PromoverCoordenadorInput,
} from "./coordenacao.validation.js";
import { UsuariosService } from "../usuarios/usuarios.service.js";

export class CoordenacaoService {
  private readonly lotacoes: LotacoesRepository;
  private readonly usuariosService: UsuariosService;

  constructor(private readonly prisma: PrismaClient) {
    this.lotacoes = new LotacoesRepository(prisma);
    this.usuariosService = new UsuariosService({ prisma });
  }

  async listar(filtros?: FiltrosListagemCoordenacao): Promise<LotacaoCoordenacaoDetalhada[]> {
    return this.lotacoes.listar(filtros);
  }

  async buscarPorId(id: string): Promise<LotacaoCoordenacaoDetalhada> {
    if (!ehObjectId(id)) throw new ValidationError("Id de coordenacao invalido.");
    const lotacao = await this.lotacoes.buscarPorId(id);
    if (!lotacao) throw new NotFoundError("Coordenacao nao encontrada.");
    return lotacao;
  }

  async criar(ator: AtorAutenticado, dados: CriarCoordenacaoInput): Promise<LotacaoCoordenacaoDetalhada> {
    this.garantirPermissaoCoordenador(ator);

    const docente = await this.prisma.usuario.findUnique({
      where: { id: dados.docenteId },
    });
    if (!docente) throw new NotFoundError("Docente/servidor nao encontrado.");
    if (!docente.ativo) throw new BusinessRuleError("Usuario inativo nao pode receber atribuicao de coordenacao.");
    if (docente.tipoCredencial === TipoCredencial.MATRICULA_ALUNO) {
      throw new BusinessRuleError("Alunos nao podem receber atribuicao de coordenacao.");
    }

    const predio = await this.prisma.predio.findUnique({
      where: { id: dados.predioId },
    });
    if (!predio) throw new NotFoundError("Predio nao encontrado.");

    const existente = await this.prisma.lotacaoCoordenacao.findFirst({
      where: { docenteId: dados.docenteId, predioId: dados.predioId, ativo: true },
    });
    if (existente) {
      throw new BusinessRuleError("O servidor ja possui coordenacao ativa vinculada a este predio.");
    }

    // Se o usuário ainda não tiver nível de coordenador, eleva seu nível
    if (docente.nivelAcesso !== NivelAcesso.COORDENADOR) {
      await this.prisma.usuario.update({
        where: { id: docente.id },
        data: { nivelAcesso: NivelAcesso.COORDENADOR },
      });
    }

    return this.lotacoes.criar({
      docenteId: dados.docenteId,
      predioId: dados.predioId,
      numeroPortaria: dados.numeroPortaria || "PORTARIA-ATRIBUICAO",
      ativo: dados.ativo,
    });
  }

  async atualizar(
    ator: AtorAutenticado,
    id: string,
    dados: AtualizarCoordenacaoInput,
  ): Promise<LotacaoCoordenacaoDetalhada> {
    this.garantirPermissaoCoordenador(ator);
    await this.buscarPorId(id);

    if (dados.docenteId) {
      const docente = await this.prisma.usuario.findUnique({ where: { id: dados.docenteId } });
      if (!docente) throw new NotFoundError("Docente informado nao encontrado.");
    }

    if (dados.predioId) {
      const predio = await this.prisma.predio.findUnique({ where: { id: dados.predioId } });
      if (!predio) throw new NotFoundError("Predio informado nao encontrado.");
    }

    return this.lotacoes.atualizar(id, dados);
  }

  async remover(ator: AtorAutenticado, id: string): Promise<void> {
    this.garantirPermissaoCoordenador(ator);
    await this.buscarPorId(id);
    await this.lotacoes.remover(id);
  }

  async promover(ator: AtorAutenticado, usuarioId: string, dados?: PromoverCoordenadorInput) {
    return this.usuariosService.promoverCoordenador(ator, usuarioId, dados);
  }

  private garantirPermissaoCoordenador(ator: AtorAutenticado): void {
    if (ator.nivelAcesso !== NivelAcesso.COORDENADOR) {
      throw new ForbiddenError("Apenas coordenadores podem gerenciar lotacoes de coordenacao.");
    }
  }
}


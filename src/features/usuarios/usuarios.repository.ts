import type { Prisma, TipoCredencial, TipoEntradaCredencial } from "@prisma/client";
import type { DbClient } from "../../shared/database/transacao.js";

export interface UsuarioResumo {
  id: string;
  nome: string;
  emailInstitucional?: string | null;
  telefone?: string | null;
  tipoCredencial: TipoCredencial;
  nivelAcesso?: number;
  codigoLogin?: string;
  departamentoId?: string | null;
  ativo: boolean;
}

export interface CredencialAutenticacao {
  id: string;
  usuarioId: string;
  tipoEntrada: TipoEntradaCredencial;
  entrada: string;
  senhaHash: string;
  usuario: {
    id: string;
    nome: string;
    tipoCredencial: TipoCredencial;
    nivelAcesso?: number;
    codigoLogin: string;
    ativo: boolean;
    departamentoId: string | null;
  };
}

export interface PerfilUsuario {
  id: string;
  nome: string;
  emailInstitucional: string | null;
  telefone: string | null;
  codigoLogin: string;
  tipoCredencial: TipoCredencial;
  nivelAcesso: number;
  ativo: boolean;
  criadoEm: Date;
  curso: { id: string; nome: string } | null;
  departamento: { id: string; nome: string } | null;
  lotacoesCoordenacao: Array<{
    id: string;
    predioId: string;
    setorId: string | null;
    numeroPortaria: string;
    ativo: boolean;
    predio?: {
      id: string;
      nome: string;
      campusId: string | null;
      setorId: string | null;
    } | null;
    setor?: {
      id: string;
      nome: string;
      sigla: string | null;
    } | null;
  }>;
}

export class UsuariosRepository {
  constructor(private readonly db: DbClient) {}

  buscarResumoPorId(id: string): Promise<UsuarioResumo | null> {
    return this.db.usuario.findUnique({
      where: { id },
      select: {
        id: true,
        nome: true,
        emailInstitucional: true,
        telefone: true,
        tipoCredencial: true,
        nivelAcesso: true,
        codigoLogin: true,
        departamentoId: true,
        ativo: true,
      },
    });
  }

  buscarPorIdentificadorUnico(dados: { id?: string; email?: string; codigoLogin?: string }): Promise<boolean> {
    const alternativas = [
      ...(dados.id ? [{ id: dados.id }] : []),
      ...(dados.email ? [{ emailInstitucional: dados.email }] : []),
      ...(dados.codigoLogin ? [{ codigoLogin: dados.codigoLogin }] : []),
    ];
    if (alternativas.length === 0) return Promise.resolve(false);

    return this.db.usuario.findFirst({
      where: { OR: alternativas },
      select: { id: true },
    }).then((usuario) => usuario !== null);
  }

  criarUsuario(dados: Prisma.UsuarioUncheckedCreateInput) {
    return this.db.usuario.create({ data: dados });
  }

  criarCoordenacao(dados: Prisma.LotacaoCoordenacaoUncheckedCreateInput) {
    return this.db.lotacaoCoordenacao.create({ data: dados });
  }

  async criarCredencial(dados: Prisma.CredencialUncheckedCreateInput): Promise<void> {
    await this.db.credencial.create({ data: dados });
  }

  async possuiLotacaoAtiva(docenteId: string): Promise<boolean> {
    const lotacao = await this.db.lotacaoCoordenacao.findFirst({
      where: { docenteId, ativo: true },
      select: { id: true },
    });
    return lotacao !== null;
  }

  async possuiLotacaoAtivaNoPredio(docenteId: string, predioId: string): Promise<boolean> {
    const lotacao = await this.db.lotacaoCoordenacao.findFirst({
      where: { docenteId, predioId, ativo: true },
      select: { id: true },
    });
    return lotacao !== null;
  }

  buscarCredencial(tipoEntrada: TipoEntradaCredencial, entrada: string): Promise<CredencialAutenticacao | null> {
    return this.db.credencial.findUnique({
      where: { entrada },
      select: {
        id: true,
        usuarioId: true,
        tipoEntrada: true,
        entrada: true,
        senhaHash: true,
        usuario: {
          select: {
            id: true,
            nome: true,
            tipoCredencial: true,
            nivelAcesso: true,
            codigoLogin: true,
            ativo: true,
            departamentoId: true,
          },
        },
      },
    }).then((credential) => credential?.tipoEntrada === tipoEntrada ? credential : null);
  }

  buscarUsuarioParaAutenticacao(id: string): Promise<UsuarioResumo | null> {
    return this.buscarResumoPorId(id);
  }

  buscarPerfilCompleto(id: string): Promise<PerfilUsuario | null> {
    return this.db.usuario.findUnique({
      where: { id },
      select: {
        id: true,
        nome: true,
        emailInstitucional: true,
        telefone: true,
        codigoLogin: true,
        tipoCredencial: true,
        nivelAcesso: true,
        ativo: true,
        criadoEm: true,
        curso: { select: { id: true, nome: true } },
        departamento: { select: { id: true, nome: true } },
        lotacoesCoordenacao: {
          select: {
            id: true,
            predioId: true,
            setorId: true,
            numeroPortaria: true,
            ativo: true,
            predio: {
              select: {
                id: true,
                nome: true,
                campusId: true,
                setorId: true,
              },
            },
            setor: {
              select: {
                id: true,
                nome: true,
                sigla: true,
              },
            },
          },
        },
      },
    });
  }

  /**
   * Escreve no documento do usuario para serializar transacoes concorrentes do mesmo solicitante
   * (gera write conflict entre elas). Usado na quota de 12 horas do aluno.
   */
  async travarSolicitacoes(id: string): Promise<void> {
    await this.db.usuario.update({
      where: { id },
      data: { versaoSolicitacoes: { increment: 1 } },
      select: { id: true },
    });
  }
}

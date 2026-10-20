import { TipoCredencial, TipoEntradaCredencial, type PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { timingSafeEqual } from "node:crypto";
import jwt from "jsonwebtoken";
import { ConflictError, ForbiddenError, NotFoundError, UnauthorizedError, ValidationError } from "../../shared/errors/app-error.js";
import { executarTransacao } from "../../shared/database/transacao.js";
import { NivelAcesso } from "./nivel-acesso.js";
import type { CadastroUsuarioDTO } from "./cadastro-usuario.dto.js";
import { TipoEntrada, type AutenticarCredencialDTO, type CredencialAutenticadaDTO } from "./credencial.dto.js";
import { ID_CATALOGO_DEPARTAMENTOS } from "./departamentos-elegiveis.repository.js";
import type { DepartamentoElegivel } from "./departamentos-elegiveis.js";
import { obterJwtSecret as obterJwtSecretPorAmbiente, obterOpcoesAssinaturaJwt } from "../../shared/config/jwt.config.js";
import { UsuariosRepository } from "./usuarios.repository.js";

const CUSTO_HASH = 12;
const TOKEN_TTL = "8h";

export interface DependenciasUsuariosService {
  prisma: PrismaClient;
  jwtSecret?: string;
  provisionKey?: string;
}

export class UsuariosService {
  private readonly prisma: PrismaClient;
  private readonly jwtSecret: string;
  private readonly provisionKey: string;

  constructor({
    prisma,
    jwtSecret,
    provisionKey = process.env.USER_PROVISION_KEY,
  }: DependenciasUsuariosService) {
    this.prisma = prisma;
    this.jwtSecret = jwtSecret ?? "";
    this.provisionKey = provisionKey ?? "";
  }

  async cadastrar(dto: CadastroUsuarioDTO, chaveProvisionamento?: string): Promise<{ uuid: string; nivelAcesso: NivelAcesso }> {
    const dados = validarCadastro(dto);
    if (dados.tipoCredencial !== TipoCredencial.MATRICULA_ALUNO && !chaveValida(chaveProvisionamento, this.provisionKey)) {
      throw new ForbiddenError("Cadastro de servidor requer provisionamento autorizado.");
    }
    await this.validarReferencia(dados.tipoCredencial, dados.cursoId, dados.departamentoId);
    const repo = new UsuariosRepository(this.prisma);
    const duplicado = await repo.buscarPorIdentificadorUnico({
      ...(dados.uuid ? { id: dados.uuid } : {}),
      email: dados.email,
      codigoLogin: dados.codigoLogin,
    });
    if (duplicado) throw new ConflictError("UUID, email ou identificador de login ja cadastrado.");

    const senhaHash = await bcrypt.hash(dados.credencial.senha, CUSTO_HASH);

    try {
      const usuario = await executarTransacao(this.prisma, async (tx) => {
        const usuarios = new UsuariosRepository(tx);
        const criado = await usuarios.criarUsuario({
          ...(dados.uuid ? { id: dados.uuid } : {}),
          nome: dados.nome,
          emailInstitucional: dados.email,
          telefone: dados.telefone,
          codigoLogin: dados.codigoLogin,
          tipoCredencial: dados.tipoCredencial,
          nivelAcesso: nivelParaTipo(dados.tipoCredencial),
          ativo: true,
          ...(dados.tipoCredencial === TipoCredencial.MATRICULA_ALUNO
            ? { cursoId: dados.cursoId }
            : { departamentoId: dados.departamentoId }),
        });
        await usuarios.criarCredencial({
          usuarioId: criado.id,
          tipoEntrada: paraTipoEntradaPrisma(dados.credencial.tipoEntrada),
          entrada: dados.credencial.entrada,
          senhaHash,
        });
        return criado;
      });
      const nivelAcesso = usuario.tipoCredencial === TipoCredencial.SIAPE_DOCENTE &&
        await new UsuariosRepository(this.prisma).possuiLotacaoAtiva(usuario.id)
        ? NivelAcesso.COORDENADOR
        : nivelParaTipo(usuario.tipoCredencial);
      return { uuid: usuario.id, nivelAcesso };
    } catch (error) {
      if (ehErroUnicidadePrisma(error)) {
        throw new ConflictError("UUID, email, matricula, SIAPE ou entrada de credencial ja cadastrado.");
      }
      throw error;
    }
  }

  async listarDepartamentosElegiveis(): Promise<DepartamentoElegivel[]> {
    const catalogo = await this.prisma.catalogoDepartamentosCoordenacao.findUnique({
      where: { id: ID_CATALOGO_DEPARTAMENTOS },
      select: { departamentos: true },
    });
    if (!catalogo) throw new Error("Catálogo de departamentos elegíveis não foi inicializado.");
    return catalogo.departamentos.map(({ sigla, ...departamento }) => ({
      ...departamento,
      ...(sigla ? { sigla } : {}),
    }));
  }

  async autenticar(dto: AutenticarCredencialDTO): Promise<CredencialAutenticadaDTO> {
    if (!dto || typeof dto !== "object") throw new ValidationError("Credencial invalida.");
    const tipoEntrada = paraTipoEntradaPrisma(dto.tipoEntrada);
    const entrada = normalizarIdentificador(dto.entrada);
    const senha = normalizarSegredo(dto.senha);
    if (!entrada || !senha) throw new ValidationError("Informe entrada e senha.");

    const credencial = await new UsuariosRepository(this.prisma).buscarCredencial(tipoEntrada, entrada);
    if (!credencial || !credencial.usuario.ativo || !(await bcrypt.compare(senha, credencial.senhaHash))) {
      throw new UnauthorizedError("Credenciais invalidas.");
    }

    let nivelAcesso = nivelParaTipo(credencial.usuario.tipoCredencial);
    if (
      credencial.usuario.tipoCredencial === TipoCredencial.SIAPE_DOCENTE &&
      await new UsuariosRepository(this.prisma).possuiLotacaoAtiva(credencial.usuario.id)
    ) {
      nivelAcesso = NivelAcesso.COORDENADOR;
    }

    const token = jwt.sign(
      {
        nome: credencial.usuario.nome,
        nivelAcesso,
        tipoCredencial: credencial.usuario.tipoCredencial,
        departamentoId: credencial.usuario.departamentoId,
      },
      obterJwtSecret(this.jwtSecret),
      obterOpcoesAssinaturaJwt(credencial.usuario.id),
    );

    return { uuid: credencial.usuario.id, nivelAcesso, token };
  }

  async buscarMeuPerfil(uuid: string) {
    const usuarios = new UsuariosRepository(this.prisma);
    const perfil = await usuarios.buscarPerfilCompleto(uuid);
    if (!perfil || !perfil.ativo) throw new NotFoundError("Perfil de usuario nao encontrado.");

    const lotacoesAtivas = perfil.lotacoesCoordenacao.filter((lotacao) => lotacao.ativo);
    const nivelAcesso = perfil.tipoCredencial === TipoCredencial.SIAPE_DOCENTE && lotacoesAtivas.length > 0
      ? NivelAcesso.COORDENADOR
      : nivelParaTipo(perfil.tipoCredencial);

    return {
      uuid: perfil.id,
      nome: perfil.nome,
      email: perfil.emailInstitucional,
      telefone: perfil.telefone,
      nivelAcesso,
      role: NivelAcesso[nivelAcesso],
      tipoCredencial: perfil.tipoCredencial,
      identificador: perfil.codigoLogin,
      ativo: perfil.ativo,
      criadoEm: perfil.criadoEm,
      aluno: perfil.curso ? { matricula: perfil.codigoLogin, curso: perfil.curso } : null,
      servidor: perfil.departamento
        ? { siape: perfil.codigoLogin, departamento: perfil.departamento }
        : null,
      coordenacoes: lotacoesAtivas,
    };
  }

  private async validarReferencia(
    tipo: TipoCredencial,
    cursoId: string | undefined,
    departamentoId: string | undefined,
  ): Promise<void> {
    if (tipo === TipoCredencial.MATRICULA_ALUNO && cursoId) {
      const existe = await this.prisma.curso.findUnique({ where: { id: cursoId }, select: { id: true } });
      if (!existe) throw new ValidationError("O curso informado nao existe.");
    }
    if (tipo !== TipoCredencial.MATRICULA_ALUNO && departamentoId) {
      const existe = await this.prisma.departamento.findUnique({ where: { id: departamentoId }, select: { id: true } });
      if (!existe) throw new ValidationError("O departamento informado nao existe.");
    }
  }
}

function chaveValida(recebida: string | undefined, esperada: string): boolean {
  if (!recebida || !esperada) return false;
  const a = Buffer.from(recebida);
  const b = Buffer.from(esperada);
  return a.length === b.length && timingSafeEqual(a, b);
}

function validarCadastro(dto: CadastroUsuarioDTO) {
  if (!dto || typeof dto !== "object") throw new ValidationError("Dados de cadastro invalidos.");
  const nome = typeof dto.nome === "string" ? dto.nome.trim() : "";
  const email = typeof dto.email === "string" ? dto.email.trim().toLowerCase() : "";
  const telefone = typeof dto.telefone === "string" ? dto.telefone.trim() : undefined;
  if (telefone && !/^\+?[\d\s().-]{7,20}$/.test(telefone)) {
    throw new ValidationError("Telefone invalido.");
  }
  const credencial = dto.credencial;
  if (!credencial || typeof credencial !== "object") {
    throw new ValidationError("Credencial obrigatoria com tipoEntrada, entrada e senha.");
  }
  const senha = normalizarSegredo(credencial.senha);
  const codigoLogin = normalizarIdentificador(credencial.entrada);
  if (dto.uuid && !/^[a-f\d]{24}$/i.test(dto.uuid)) {
    throw new ValidationError("UUID deve ser um ObjectId MongoDB valido de 24 caracteres hexadecimais.");
  }
  if (!nome || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new ValidationError("Nome e email valido sao obrigatorios.");
  }
  if (!senha || Buffer.byteLength(senha, "utf8") < 8) {
    throw new ValidationError("A senha deve conter ao menos 8 bytes.");
  }
  if (Buffer.byteLength(senha, "utf8") > 72) {
    throw new ValidationError("A senha excede o limite de 72 bytes do bcrypt.");
  }
  if (!codigoLogin) throw new ValidationError("Identificador de login obrigatorio.");

  const tipoCredencial = dto.tipoCredencial;
  const credencialTipo = credencial.tipoEntrada;
  if (!(Object.values(TipoEntrada).filter((valor) => typeof valor === "number") as number[]).includes(credencialTipo)) {
    throw new ValidationError("Tipo de entrada de credencial invalido.");
  }

  if (tipoCredencial === TipoCredencial.MATRICULA_ALUNO) {
    if (!/^\d+$/.test(codigoLogin) || !dto.cursoId) {
      throw new ValidationError("Aluno requer matricula numerica e cursoId.");
    }
  } else if (tipoCredencial === TipoCredencial.SIAPE_DOCENTE || tipoCredencial === TipoCredencial.SIAPE_TECNICO) {
    if (!/^\d+$/.test(codigoLogin) || !dto.departamentoId) {
      throw new ValidationError("Servidor requer SIAPE numerico e departamentoId.");
    }
  } else {
    throw new ValidationError("Tipo de usuario invalido.");
  }

  const entrada = normalizarIdentificador(credencial.entrada);
  return {
    uuid: dto.uuid,
    nome,
    email,
    telefone,
    credencial: { tipoEntrada: credencialTipo, entrada, senha },
    codigoLogin,
    tipoCredencial,
    cursoId: dto.cursoId,
    departamentoId: dto.departamentoId,
  };
}

function nivelParaTipo(tipo: TipoCredencial): NivelAcesso {
  switch (tipo) {
    case TipoCredencial.MATRICULA_ALUNO:
      return NivelAcesso.ALUNO;
    case TipoCredencial.SIAPE_TECNICO:
      return NivelAcesso.TECNICO;
    case TipoCredencial.SIAPE_DOCENTE:
      return NivelAcesso.PROFESSOR;
  }
}

function normalizarIdentificador(valor: unknown): string {
  if (typeof valor !== "string" && typeof valor !== "number") return "";
  return String(valor).trim();
}

function normalizarSegredo(valor: unknown): string {
  if (typeof valor !== "string" && typeof valor !== "number") return "";
  return String(valor);
}

function ehErroUnicidadePrisma(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "P2002";
}

export function extrairSubToken(token: jwt.JwtPayload): string {
  if (typeof token.sub !== "string") throw new UnauthorizedError("Token invalido.");
  return token.sub;
}

export function paraTipoEntradaPrisma(tipo: TipoEntrada): TipoEntradaCredencial {
  switch (tipo) {
    case TipoEntrada.LOCAL:
      return TipoEntradaCredencial.LOCAL;
    case TipoEntrada.CORPORATIVA:
      return TipoEntradaCredencial.CORPORATIVA;
    case TipoEntrada.OAUTH:
      return TipoEntradaCredencial.OAUTH;
    default:
      throw new ValidationError("Tipo de entrada de credencial invalido.");
  }
}

export function obterJwtSecret(configurado?: string): string {
  return obterJwtSecretPorAmbiente(configurado);
}
function _validarJwtLegado(configurado = process.env.JWT_SECRET): string {
  if (!configurado || configurado.length < 32) {
    throw new Error("JWT_SECRET deve estar definido no .env e ter pelo menos 32 caracteres.");
  }
  return obterJwtSecretPorAmbiente(configurado);
}

import { TipoCredencial, TipoEntradaCredencial, type PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { timingSafeEqual } from "node:crypto";
import jwt from "jsonwebtoken";
import { ConflictError, ForbiddenError, NotFoundError, UnauthorizedError, ValidationError } from "../../shared/errors/app-error.js";
import { executarTransacao } from "../../shared/database/transacao.js";
import { NivelAcesso } from "./nivel-acesso.js";
import type { CadastroUsuarioDTO, LotacaoCoordenacaoCadastroInput, PapelCadastroUsuario } from "./cadastro-usuario.dto.js";
import { TipoEntrada, type AutenticarCredencialDTO, type CredencialAutenticadaDTO } from "./credencial.dto.js";
import { ID_CATALOGO_DEPARTAMENTOS } from "./departamentos-elegiveis.repository.js";
import type { DepartamentoElegivel } from "./departamentos-elegiveis.js";
import { obterJwtSecret as obterJwtSecretPorAmbiente, obterOpcoesAssinaturaJwt } from "../../shared/config/jwt.config.js";
import { UsuariosRepository } from "./usuarios.repository.js";

const CUSTO_HASH = 12;

export interface DependenciasUsuariosService {
  prisma: PrismaClient;
  jwtSecret?: string;
}

export interface OpcoesCadastroUsuario {
  exigirPapel?: PapelCadastroUsuario;
  papelRota?: PapelCadastroUsuario;
  permitirServidorBase?: boolean;
  exigirServidor?: boolean;
}

export class UsuariosService {
  private readonly prisma: PrismaClient;
  private readonly jwtSecret: string;

  constructor({
    prisma,
    jwtSecret,
  }: DependenciasUsuariosService) {
    this.prisma = prisma;
    this.jwtSecret = jwtSecret ?? "";
  }

  async cadastrar(
    dto: CadastroUsuarioDTO,
    opcoesOuChave?: OpcoesCadastroUsuario | string,
    opcoesLegado?: OpcoesCadastroUsuario,
  ) {
    const opcoes =
      typeof opcoesOuChave === "object" && opcoesOuChave !== null
        ? opcoesOuChave
        : opcoesLegado;
    const dados = validarCadastro(dto, opcoes);
    await this.validarReferencia(
      dados.tipoCredencial,
      dados.departamentoId,
      dados.coordenacoes,
    );

    const repo = new UsuariosRepository(this.prisma);
    const duplicado = await repo.buscarPorIdentificadorUnico({
      ...(dados.uuid ? { id: dados.uuid } : {}),
      ...(dados.email ? { email: dados.email } : {}),
      codigoLogin: dados.codigoLogin,
    });
    if (duplicado) throw new ConflictError("UUID, email ou identificador de login ja cadastrado.");

    const senhaHash = await bcrypt.hash(dados.credencial.senha, CUSTO_HASH);

    try {
      const resultado = await executarTransacao(this.prisma, async (tx) => {
        const usuarios = new UsuariosRepository(tx);
        const criado = await usuarios.criarUsuario({
          ...(dados.uuid ? { id: dados.uuid } : {}),
          nome: dados.nome,
          ...(dados.email ? { emailInstitucional: dados.email } : {}),
          ...(dados.telefone ? { telefone: dados.telefone } : {}),
          codigoLogin: dados.codigoLogin,
          tipoCredencial: dados.tipoCredencial,
          nivelAcesso: dados.nivelAcesso,
          ativo: true,
          ...(dados.tipoCredencial !== TipoCredencial.MATRICULA_ALUNO && dados.departamentoId
            ? { departamentoId: dados.departamentoId }
            : {}),
        });

        await usuarios.criarCredencial({
          usuarioId: criado.id,
          tipoEntrada: paraTipoEntradaPrisma(dados.credencial.tipoEntrada),
          entrada: dados.credencial.entrada,
          senhaHash,
        });

        if (dados.papel === "COORDENADOR" && dados.coordenacoes.length > 0) {
          for (const coord of dados.coordenacoes) {
            await usuarios.criarCoordenacao({
              docenteId: criado.id,
              predioId: coord.predioId,
              numeroPortaria: coord.numeroPortaria,
              ativo: true,
            });
          }
        }

        return criado;
      });

      const perfil = await new UsuariosRepository(this.prisma).buscarPerfilCompleto(resultado.id);
      const lotacoesAtivas = (perfil?.lotacoesCoordenacao ?? []).filter((l) => l.ativo);
      const nivelAcesso =
        resultado.nivelAcesso === NivelAcesso.COORDENADOR ||
        (resultado.tipoCredencial === TipoCredencial.SIAPE_DOCENTE && lotacoesAtivas.length > 0)
          ? NivelAcesso.COORDENADOR
          : nivelParaTipo(resultado.tipoCredencial);

      return {
        uuid: resultado.id,
        nivelAcesso,
        role: NivelAcesso[nivelAcesso],
        nome: resultado.nome,
        email: resultado.emailInstitucional ?? null,
        telefone: resultado.telefone ?? null,
        tipoCredencial: resultado.tipoCredencial,
        identificador: resultado.codigoLogin,
        ...(resultado.tipoCredencial === TipoCredencial.MATRICULA_ALUNO
          ? {
              aluno: {
                matricula: resultado.codigoLogin,
              },
            }
          : {
              servidor: {
                siape: resultado.codigoLogin,
                departamento: perfil?.departamento ?? null,
              },
            }),
        coordenacoes: lotacoesAtivas.map((lotacao) => ({
          id: lotacao.id,
          predioId: lotacao.predioId,
          numeroPortaria: lotacao.numeroPortaria,
          ativo: lotacao.ativo,
          coordenador: {
            id: resultado.id,
            nome: resultado.nome,
            siape: resultado.codigoLogin,
            email: resultado.emailInstitucional ?? null,
          },
          predio: lotacao.predio ?? null,
        })),
      };
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

  async listarServidores(opcoes?: {
    role?: string;
    departamentoId?: string;
    predioId?: string;
    apenasAtivos?: boolean;
  }) {
    const usuarios = new UsuariosRepository(this.prisma);
    const servidores = await usuarios.listarServidores({
      apenasAtivos: opcoes?.apenasAtivos,
      departamentoId: opcoes?.departamentoId,
    });

    const mapeados = servidores.map((servidor) => {
      const lotacoesAtivas = (servidor.lotacoesCoordenacao ?? []).filter((lotacao) => lotacao.ativo);
      const nivelAcesso =
        servidor.nivelAcesso === NivelAcesso.COORDENADOR ||
        (servidor.tipoCredencial === TipoCredencial.SIAPE_DOCENTE && lotacoesAtivas.length > 0)
          ? NivelAcesso.COORDENADOR
          : nivelParaTipo(servidor.tipoCredencial);

      const role = NivelAcesso[nivelAcesso] as "PROFESSOR" | "TECNICO" | "COORDENADOR";

      return {
        id: servidor.id,
        uuid: servidor.id,
        nome: servidor.nome,
        email: servidor.emailInstitucional ?? null,
        telefone: servidor.telefone ?? null,
        siape: servidor.codigoLogin,
        identificador: servidor.codigoLogin,
        role,
        nivelAcesso,
        tipoCredencial: servidor.tipoCredencial,
        ativo: servidor.ativo,
        departamento: servidor.departamento ?? null,
        coordenacoes: lotacoesAtivas.map((lotacao) => ({
          id: lotacao.id,
          predioId: lotacao.predioId,
          numeroPortaria: lotacao.numeroPortaria,
          ativo: lotacao.ativo,
          predio: lotacao.predio ?? null,
        })),
        criadoEm: servidor.criadoEm,
      };
    });

    return mapeados.filter((s) => {
      if (opcoes?.role && s.role.toUpperCase() !== opcoes.role.toUpperCase()) {
        return false;
      }
      if (opcoes?.predioId) {
        const coordenaPredio = s.coordenacoes.some((c) => c.predioId === opcoes.predioId);
        if (!coordenaPredio) return false;
      }
      return true;
    });
  }

  async autenticar(dto: AutenticarCredencialDTO): Promise<CredencialAutenticadaDTO> {
    if (!dto || typeof dto !== "object") throw new ValidationError("Credencial invalida.");
    const tipoEntrada = paraTipoEntradaPrisma(dto.tipoEntrada ?? TipoEntrada.LOCAL);
    const entrada = normalizarIdentificador(dto.entrada);
    const senha = normalizarSegredo(dto.senha);
    if (!entrada || !senha) throw new ValidationError("Informe entrada e senha.");

    const credencial = await new UsuariosRepository(this.prisma).buscarCredencial(tipoEntrada, entrada);
    if (!credencial || !credencial.usuario.ativo || !(await bcrypt.compare(senha, credencial.senhaHash))) {
      throw new UnauthorizedError("Credenciais invalidas.");
    }

    let nivelAcesso = nivelParaTipo(credencial.usuario.tipoCredencial);
    if (
      credencial.usuario.nivelAcesso === NivelAcesso.COORDENADOR ||
      (credencial.usuario.tipoCredencial === TipoCredencial.SIAPE_DOCENTE &&
        await new UsuariosRepository(this.prisma).possuiLotacaoAtiva(credencial.usuario.id))
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
    const nivelAcesso =
      perfil.nivelAcesso === NivelAcesso.COORDENADOR ||
      (perfil.tipoCredencial === TipoCredencial.SIAPE_DOCENTE && lotacoesAtivas.length > 0)
        ? NivelAcesso.COORDENADOR
        : nivelParaTipo(perfil.tipoCredencial);

    return {
      uuid: perfil.id,
      nome: perfil.nome,
      email: perfil.emailInstitucional ?? null,
      telefone: perfil.telefone ?? null,
      nivelAcesso,
      role: NivelAcesso[nivelAcesso],
      tipoCredencial: perfil.tipoCredencial,
      identificador: perfil.codigoLogin,
      ativo: perfil.ativo,
      criadoEm: perfil.criadoEm,
      aluno:
        perfil.tipoCredencial === TipoCredencial.MATRICULA_ALUNO
          ? { matricula: perfil.codigoLogin }
          : null,
      servidor:
        perfil.tipoCredencial !== TipoCredencial.MATRICULA_ALUNO
          ? { siape: perfil.codigoLogin, departamento: perfil.departamento }
          : null,
      coordenacoes: lotacoesAtivas.map((lotacao) => ({
        id: lotacao.id,
        predioId: lotacao.predioId,
        numeroPortaria: lotacao.numeroPortaria,
        ativo: lotacao.ativo,
        coordenador: {
          id: perfil.id,
          nome: perfil.nome,
          siape: perfil.codigoLogin,
          email: perfil.emailInstitucional ?? null,
        },
        predio: lotacao.predio ?? null,
      })),
    };
  }

  private async validarReferencia(
    tipo: TipoCredencial,
    departamentoId: string | undefined,
    coordenacoes: Array<{ predioId: string }> = [],
  ): Promise<void> {
    if (tipo !== TipoCredencial.MATRICULA_ALUNO) {
      if (!departamentoId) {
        throw new ValidationError("departamentoId e obrigatorio para cadastro de servidores (PROFESSOR, TECNICO ou COORDENADOR).");
      }
      const existe = await this.prisma.departamento.findUnique({ where: { id: departamentoId }, select: { id: true } });
      if (!existe) throw new ValidationError("O departamento informado nao existe.");
    }
    for (const coord of coordenacoes) {
      const predio = await this.prisma.predio.findUnique({
        where: { id: coord.predioId },
        select: { id: true },
      });
      if (!predio) {
        throw new ValidationError(`O predio informado para coordenacao (${coord.predioId}) nao existe.`);
      }
    }
  }
}

function chaveValida(recebida: string | undefined, esperada: string): boolean {
  if (!recebida || !esperada) return false;
  const a = Buffer.from(recebida);
  const b = Buffer.from(esperada);
  return a.length === b.length && timingSafeEqual(a, b);
}

interface DadosCadastroNormalizados {
  uuid?: string;
  nome: string;
  email?: string;
  telefone?: string;
  credencial: {
    tipoEntrada: TipoEntrada;
    entrada: string;
    senha: string;
  };
  codigoLogin: string;
  papel: PapelCadastroUsuario;
  tipoCredencial: TipoCredencial;
  nivelAcesso: NivelAcesso;
  departamentoId?: string;
  coordenacoes: Array<{
    predioId: string;
    numeroPortaria: string;
  }>;
}

function validarCadastro(dto: CadastroUsuarioDTO, opcoes?: OpcoesCadastroUsuario): DadosCadastroNormalizados {
  if (!dto || typeof dto !== "object") throw new ValidationError("Dados de cadastro invalidos.");
  const registroBruto = dto as unknown as Record<string, unknown>;
  if (registroBruto.curso !== undefined || registroBruto.cursoId !== undefined || registroBruto.periodoAtual !== undefined) {
    throw new ValidationError("O campo curso/cursoId foi removido do modelo e nao e aceito no cadastro.");
  }
  if (registroBruto.setor !== undefined || registroBruto.setorId !== undefined) {
    throw new ValidationError("O campo setor/setorId foi removido do modelo; a coordenacao vincula-se diretamente ao predio.");
  }

  const nome = typeof dto.nome === "string" ? dto.nome.trim() : "";
  if (!nome) {
    throw new ValidationError("Nome e obrigatorio.");
  }

  const emailBruto = typeof dto.email === "string" ? dto.email.trim().toLowerCase() : "";
  if (dto.email !== undefined && dto.email !== null && typeof dto.email !== "string") {
    throw new ValidationError("Email invalido.");
  }
  if (emailBruto && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailBruto)) {
    throw new ValidationError("Email institucional informado e invalido.");
  }
  const email = emailBruto || undefined;

  const telefoneBruto = typeof dto.telefone === "string" ? dto.telefone.trim() : "";
  if (dto.telefone !== undefined && dto.telefone !== null && typeof dto.telefone !== "string") {
    throw new ValidationError("Telefone invalido.");
  }
  if (telefoneBruto && !/^\+?[\d\s().-]{7,20}$/.test(telefoneBruto)) {
    throw new ValidationError("Telefone invalido.");
  }
  const telefone = telefoneBruto || undefined;

  if (dto.uuid && !/^[a-f\d]{24}$/i.test(dto.uuid)) {
    throw new ValidationError("UUID deve ser um ObjectId MongoDB valido de 24 caracteres hexadecimais.");
  }

  const credencial = dto.credencial;
  if (credencial !== undefined && (credencial === null || typeof credencial !== "object" || Array.isArray(credencial))) {
    throw new ValidationError("Credencial invalida.");
  }
  if (dto.senha === undefined && (!credencial || credencial.senha === undefined)) {
    throw new ValidationError("Senha e obrigatoria (informe senha ou credencial.senha).");
  }
  if (
    dto.tipoEntrada !== undefined &&
    credencial?.tipoEntrada !== undefined &&
    dto.tipoEntrada !== credencial.tipoEntrada
  ) {
    throw new ValidationError("Conflito entre tipoEntrada e credencial.tipoEntrada informados no cadastro.");
  }
  const credencialTipo = dto.tipoEntrada ?? credencial?.tipoEntrada ?? TipoEntrada.LOCAL;
  if (!(Object.values(TipoEntrada).filter((valor) => typeof valor === "number") as number[]).includes(credencialTipo)) {
    throw new ValidationError("Tipo de entrada de credencial invalido.");
  }

  const senhaTopo = dto.senha !== undefined ? normalizarSegredo(dto.senha) : undefined;
  const senhaCredencial = credencial?.senha !== undefined ? normalizarSegredo(credencial.senha) : undefined;
  if (senhaTopo !== undefined && senhaCredencial !== undefined && senhaTopo !== senhaCredencial) {
    throw new ValidationError("Conflito entre senha e credencial.senha informadas no cadastro.");
  }

  const senha = senhaTopo ?? senhaCredencial ?? "";
  if (!senha || Buffer.byteLength(senha, "utf8") < 8) {
    throw new ValidationError("A senha deve conter ao menos 8 bytes.");
  }
  if (Buffer.byteLength(senha, "utf8") > 72) {
    throw new ValidationError("A senha excede o limite de 72 bytes do bcrypt.");
  }

  const papel = resolverPapelCadastro(dto, opcoes);
  if ((opcoes?.permitirServidorBase || opcoes?.exigirServidor) && papel === "ALUNO") {
    throw new ValidationError("Rota exclusiva para cadastro de servidores (PROFESSOR, TECNICO ou COORDENADOR).");
  }

  const matriculaInformada = dto.matricula !== undefined && dto.matricula !== null ? normalizarIdentificador(dto.matricula) : undefined;
  const siapeInformado = dto.siape !== undefined && dto.siape !== null ? normalizarIdentificador(dto.siape) : undefined;
  const entradaCredencial =
    credencial?.entrada !== undefined && credencial?.entrada !== null
      ? normalizarIdentificador(credencial.entrada)
      : "";

  const coordenacoes = normalizarCoordenacoesCadastro(dto);
  const departamentoId = typeof dto.departamentoId === "string" && dto.departamentoId.trim() ? dto.departamentoId.trim() : undefined;

  if (departamentoId && !/^[a-f\d]{24}$/i.test(departamentoId)) {
    throw new ValidationError("departamentoId deve ser um ObjectId MongoDB valido de 24 caracteres hexadecimais.");
  }

  if (papel === "ALUNO") {
    if (siapeInformado !== undefined) {
      throw new ValidationError("Aluno deve ser cadastrado com matricula e nao pode utilizar SIAPE.");
    }
    if (departamentoId) {
      throw new ValidationError("Aluno nao pode informar departamentoId de servidor.");
    }
    if (coordenacoes.length > 0) {
      throw new ValidationError("Aluno nao pode receber lotacao de coordenacao.");
    }
    if (
      matriculaInformada !== undefined &&
      entradaCredencial !== "" &&
      matriculaInformada.toUpperCase() !== entradaCredencial.toUpperCase()
    ) {
      throw new ValidationError("A matricula informada deve coincidir com credencial.entrada.");
    }
    const codigoLogin = matriculaInformada || entradaCredencial;
    if (!codigoLogin) {
      throw new ValidationError("Matricula do aluno e obrigatoria.");
    }

    return {
      uuid: dto.uuid,
      nome,
      email,
      telefone,
      credencial: { tipoEntrada: credencialTipo, entrada: codigoLogin, senha },
      codigoLogin,
      papel: "ALUNO",
      tipoCredencial: TipoCredencial.MATRICULA_ALUNO,
      nivelAcesso: NivelAcesso.ALUNO,
      coordenacoes: [],
    };
  }

  // Papeis de servidor: PROFESSOR, TECNICO ou COORDENADOR
  if (matriculaInformada !== undefined) {
    throw new ValidationError("Servidor (PROFESSOR, TECNICO ou COORDENADOR) deve ser cadastrado com SIAPE e nao pode utilizar matricula de aluno.");
  }
  if (!departamentoId) {
    throw new ValidationError("departamentoId e obrigatorio para cadastro de servidores (PROFESSOR, TECNICO ou COORDENADOR).");
  }
  if (papel !== "COORDENADOR" && coordenacoes.length > 0) {
    throw new ValidationError("Apenas usuarios com papel COORDENADOR podem receber lotacoes de coordenacao no cadastro.");
  }
  if (
    siapeInformado !== undefined &&
    entradaCredencial !== "" &&
    siapeInformado !== entradaCredencial
  ) {
    throw new ValidationError("O SIAPE informado deve coincidir com credencial.entrada.");
  }

  const codigoLogin = siapeInformado || entradaCredencial;
  if (!codigoLogin) {
    throw new ValidationError("SIAPE e obrigatorio para cadastro de PROFESSOR, TECNICO ou COORDENADOR.");
  }

  const tipoCredencial =
    papel === "TECNICO" ? TipoCredencial.SIAPE_TECNICO : TipoCredencial.SIAPE_DOCENTE;
  const nivelAcesso =
    papel === "COORDENADOR"
      ? NivelAcesso.COORDENADOR
      : papel === "PROFESSOR"
        ? NivelAcesso.PROFESSOR
        : NivelAcesso.TECNICO;

  return {
    uuid: dto.uuid,
    nome,
    email,
    telefone,
    credencial: { tipoEntrada: credencialTipo, entrada: codigoLogin, senha },
    codigoLogin,
    papel,
    tipoCredencial,
    nivelAcesso,
    departamentoId,
    coordenacoes,
  };
}

function resolverPapelCadastro(dto: CadastroUsuarioDTO, opcoes?: OpcoesCadastroUsuario): PapelCadastroUsuario {
  const candidatos = new Set<PapelCadastroUsuario>();
  const papelExigido = opcoes?.exigirPapel ?? opcoes?.papelRota;

  for (const valorPapel of [dto.role, dto.perfil]) {
    if (valorPapel !== undefined && valorPapel !== null) {
      const roleNorm = String(valorPapel).trim().toUpperCase();
      if (roleNorm === "ALUNO" || roleNorm === "PROFESSOR" || roleNorm === "TECNICO" || roleNorm === "COORDENADOR") {
        candidatos.add(roleNorm);
      } else {
        throw new ValidationError("Papel (role) de usuario invalido. Valores aceitos: ALUNO, PROFESSOR, TECNICO, COORDENADOR.");
      }
    }
  }

  if (dto.nivelAcesso !== undefined && dto.nivelAcesso !== null) {
    if (typeof dto.nivelAcesso === "string") {
      const norm = dto.nivelAcesso.trim().toUpperCase();
      if (norm === "ALUNO" || norm === "PROFESSOR" || norm === "TECNICO" || norm === "COORDENADOR") {
        candidatos.add(norm);
      } else {
        throw new ValidationError("nivelAcesso invalido.");
      }
    } else {
      switch (Number(dto.nivelAcesso)) {
        case NivelAcesso.ALUNO:
          candidatos.add("ALUNO");
          break;
        case NivelAcesso.TECNICO:
          candidatos.add("TECNICO");
          break;
        case NivelAcesso.PROFESSOR:
          candidatos.add("PROFESSOR");
          break;
        case NivelAcesso.COORDENADOR:
          candidatos.add("COORDENADOR");
          break;
        default:
          throw new ValidationError("nivelAcesso invalido. Valores aceitos: 1 (ALUNO), 2 (TECNICO), 3 (PROFESSOR), 4 (COORDENADOR).");
      }
    }
  }

  const possuiDadosCoordenacao =
    Boolean(dto.predioId) ||
    (Array.isArray(dto.predioIds) && dto.predioIds.length > 0) ||
    (Array.isArray(dto.coordenacoes) && dto.coordenacoes.length > 0);

  if (dto.tipoCredencial !== undefined && dto.tipoCredencial !== null) {
    const tipoNorm = String(dto.tipoCredencial).trim().toUpperCase();
    if (tipoNorm === TipoCredencial.MATRICULA_ALUNO) {
      candidatos.add("ALUNO");
    } else if (tipoNorm === TipoCredencial.SIAPE_TECNICO) {
      candidatos.add("TECNICO");
    } else if (tipoNorm === "COORDENADOR") {
      candidatos.add("COORDENADOR");
    } else if (tipoNorm === TipoCredencial.SIAPE_DOCENTE) {
      if (!candidatos.has("COORDENADOR")) {
        candidatos.add(
          papelExigido === "COORDENADOR" || possuiDadosCoordenacao
            ? "COORDENADOR"
            : "PROFESSOR",
        );
      }
    } else {
      throw new ValidationError("Tipo de credencial invalido.");
    }
  }

  if (papelExigido) {
    if (candidatos.size > 0 && (candidatos.size > 1 || !candidatos.has(papelExigido))) {
      throw new ValidationError(`Os dados informados conflitam com o cadastro de ${papelExigido}.`);
    }
    return papelExigido;
  }

  if (candidatos.size === 0) {
    throw new ValidationError("Informe role (ALUNO, PROFESSOR, TECNICO, COORDENADOR) ou tipoCredencial.");
  }
  if (candidatos.size > 1) {
    throw new ValidationError("Conflito entre role, nivelAcesso e tipoCredencial informados no cadastro.");
  }

  return [...candidatos][0];
}

function normalizarCoordenacoesCadastro(dto: CadastroUsuarioDTO): Array<{
  predioId: string;
  numeroPortaria: string;
}> {
  const itensBrutos: LotacaoCoordenacaoCadastroInput[] = [];
  if (Array.isArray(dto.coordenacoes)) {
    itensBrutos.push(...dto.coordenacoes);
  }
  if (typeof dto.predioId === "string" && dto.predioId.trim()) {
    itensBrutos.push({
      predioId: dto.predioId.trim(),
      numeroPortaria: dto.numeroPortaria,
    });
  }
  if (Array.isArray(dto.predioIds)) {
    for (const id of dto.predioIds) {
      if (typeof id === "string" && id.trim()) {
        itensBrutos.push({
          predioId: id.trim(),
          numeroPortaria: dto.numeroPortaria,
        });
      }
    }
  }

  const vistos = new Set<string>();
  const resultado: Array<{
    predioId: string;
    numeroPortaria: string;
  }> = [];

  for (const item of itensBrutos) {
    if (!item || typeof item !== "object") {
      throw new ValidationError("Item de coordenacao invalido.");
    }
    const itemBruto = item as unknown as Record<string, unknown>;
    if (itemBruto.setor !== undefined || itemBruto.setorId !== undefined) {
      throw new ValidationError("O campo setor/setorId foi removido do modelo; a coordenacao vincula-se diretamente ao predio.");
    }
    const predioId = typeof item.predioId === "string" ? item.predioId.trim() : "";
    if (!/^[a-f\d]{24}$/i.test(predioId)) {
      throw new ValidationError("predioId da coordenacao deve ser um ObjectId MongoDB valido de 24 caracteres hexadecimais.");
    }
    if (vistos.has(predioId)) continue;
    vistos.add(predioId);

    const numeroPortaria =
      (typeof item.numeroPortaria === "string" && item.numeroPortaria.trim()) ||
      (typeof dto.numeroPortaria === "string" && dto.numeroPortaria.trim()) ||
      "PORTARIA-CADASTRO";

    resultado.push({
      predioId,
      numeroPortaria,
    });
  }

  return resultado;
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

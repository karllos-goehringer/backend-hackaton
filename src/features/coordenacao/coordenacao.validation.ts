import { ValidationError } from "../../shared/errors/app-error.js";
import { ehObjectId } from "../../shared/validation/object-id.js";

type Erros = Record<string, string>;

function ehObjeto(valor: unknown): valor is Record<string, unknown> {
  return typeof valor === "object" && valor !== null && !Array.isArray(valor);
}

export interface FiltrosListagemCoordenacao {
  docenteId?: string;
  predioId?: string;
  ativo?: boolean;
}

export function validarFiltrosCoordenacao(query: unknown): FiltrosListagemCoordenacao {
  if (!ehObjeto(query)) return {};
  const filtros: FiltrosListagemCoordenacao = {};
  const erros: Erros = {};

  if (query.docenteId !== undefined) {
    if (!ehObjectId(query.docenteId)) erros.docenteId = "docenteId deve ser um ObjectId valido.";
    else filtros.docenteId = String(query.docenteId).trim();
  }

  if (query.predioId !== undefined) {
    if (!ehObjectId(query.predioId)) erros.predioId = "predioId deve ser um ObjectId valido.";
    else filtros.predioId = String(query.predioId).trim();
  }

  if (query.ativo !== undefined) {
    if (query.ativo === "true" || query.ativo === true) filtros.ativo = true;
    else if (query.ativo === "false" || query.ativo === false) filtros.ativo = false;
    else erros.ativo = "ativo deve ser true ou false.";
  }

  if (Object.keys(erros).length > 0) {
    throw new ValidationError("Filtros de coordenacao invalidos.", erros);
  }

  return filtros;
}

export interface CriarCoordenacaoInput {
  docenteId: string;
  predioId: string;
  numeroPortaria?: string;
  ativo?: boolean;
}

export function validarCriarCoordenacao(corpo: unknown): CriarCoordenacaoInput {
  if (!ehObjeto(corpo)) throw new ValidationError("O corpo da requisicao deve ser um objeto JSON.");

  const erros: Erros = {};

  if (!ehObjectId(corpo.docenteId)) {
    erros.docenteId = "docenteId obrigatorio e deve ser um ObjectId valido.";
  }
  if (!ehObjectId(corpo.predioId)) {
    erros.predioId = "predioId obrigatorio e deve ser um ObjectId valido.";
  }

  const numeroPortaria =
    typeof corpo.numeroPortaria === "string" && corpo.numeroPortaria.trim().length > 0
      ? corpo.numeroPortaria.trim()
      : "PORTARIA-ATRIBUICAO";

  const ativo = corpo.ativo !== undefined ? Boolean(corpo.ativo) : true;

  if (Object.keys(erros).length > 0) {
    throw new ValidationError("Dados de criacao de coordenacao invalidos.", erros);
  }

  return {
    docenteId: String(corpo.docenteId).trim(),
    predioId: String(corpo.predioId).trim(),
    numeroPortaria,
    ativo,
  };
}

export interface AtualizarCoordenacaoInput {
  docenteId?: string;
  predioId?: string;
  numeroPortaria?: string;
  ativo?: boolean;
}

export function validarAtualizarCoordenacao(corpo: unknown): AtualizarCoordenacaoInput {
  if (!ehObjeto(corpo)) throw new ValidationError("O corpo da requisicao deve ser um objeto JSON.");

  const erros: Erros = {};
  const dados: AtualizarCoordenacaoInput = {};

  if (corpo.docenteId !== undefined) {
    if (!ehObjectId(corpo.docenteId)) erros.docenteId = "docenteId deve ser um ObjectId valido.";
    else dados.docenteId = String(corpo.docenteId).trim();
  }

  if (corpo.predioId !== undefined) {
    if (!ehObjectId(corpo.predioId)) erros.predioId = "predioId deve ser um ObjectId valido.";
    else dados.predioId = String(corpo.predioId).trim();
  }

  if (corpo.numeroPortaria !== undefined) {
    if (typeof corpo.numeroPortaria !== "string" || corpo.numeroPortaria.trim().length === 0) {
      erros.numeroPortaria = "numeroPortaria deve ser texto nao vazio.";
    } else {
      dados.numeroPortaria = corpo.numeroPortaria.trim();
    }
  }

  if (corpo.ativo !== undefined) {
    dados.ativo = Boolean(corpo.ativo);
  }

  if (Object.keys(erros).length > 0) {
    throw new ValidationError("Dados de atualizacao de coordenacao invalidos.", erros);
  }

  return dados;
}

export interface PromoverCoordenadorInput {
  departamentoId?: string;
  predioId?: string;
  numeroPortaria?: string;
}

export function validarPromoverCoordenador(corpo: unknown): PromoverCoordenadorInput {
  if (!corpo || !ehObjeto(corpo)) return {};

  const erros: Erros = {};
  const resultado: PromoverCoordenadorInput = {};

  if (corpo.departamentoId !== undefined && corpo.departamentoId !== null && corpo.departamentoId !== "") {
    if (!ehObjectId(corpo.departamentoId)) erros.departamentoId = "departamentoId deve ser um ObjectId valido.";
    else resultado.departamentoId = String(corpo.departamentoId).trim();
  }

  if (corpo.predioId !== undefined && corpo.predioId !== null && corpo.predioId !== "") {
    if (!ehObjectId(corpo.predioId)) erros.predioId = "predioId deve ser um ObjectId valido.";
    else resultado.predioId = String(corpo.predioId).trim();
  }

  if (corpo.numeroPortaria !== undefined && corpo.numeroPortaria !== null) {
    if (typeof corpo.numeroPortaria !== "string") erros.numeroPortaria = "numeroPortaria deve ser texto.";
    else resultado.numeroPortaria = corpo.numeroPortaria.trim();
  }

  if (Object.keys(erros).length > 0) {
    throw new ValidationError("Dados para promocao a coordenador invalidos.", erros);
  }

  return resultado;
}


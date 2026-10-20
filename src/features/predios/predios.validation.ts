import type { Endereco } from "@prisma/client";
import { ValidationError } from "../../shared/errors/app-error.js";
import { ehObjectId } from "../../shared/validation/object-id.js";
import type {
  AtualizarPredioDados,
  CriarPredioDados,
  FiltrosListagemPredios,
} from "./predios.repository.js";

type Erros = Record<string, string>;

function ehObjeto(valor: unknown): valor is Record<string, unknown> {
  return typeof valor === "object" && valor !== null && !Array.isArray(valor);
}

function lerBooleanoQuery(valor: unknown, campo: string, erros: Erros): boolean | undefined {
  if (valor === undefined) return undefined;
  if (typeof valor === "boolean") return valor;
  if (valor === "true" || valor === "1") return true;
  if (valor === "false" || valor === "0") return false;
  erros[campo] = "Informe true ou false.";
  return undefined;
}

function lerEndereco(valor: unknown, erros: Erros): Endereco | null | undefined {
  if (valor === undefined) return undefined;
  if (valor === null) return null;
  if (!ehObjeto(valor)) {
    erros.endereco = "Deve ser um objeto { rua, numero, bairro, cep } ou null.";
    return undefined;
  }
  const rua = typeof valor.rua === "string" ? valor.rua.trim() : "";
  const bairro = typeof valor.bairro === "string" ? valor.bairro.trim() : "";
  const cep = typeof valor.cep === "string" ? valor.cep.trim() : "";
  const numero = typeof valor.numero === "number" && Number.isInteger(valor.numero) ? valor.numero : NaN;

  if (!rua) erros["endereco.rua"] = "Campo obrigatorio.";
  if (!bairro) erros["endereco.bairro"] = "Campo obrigatorio.";
  if (!cep) erros["endereco.cep"] = "Campo obrigatorio.";
  if (!Number.isInteger(numero) || numero < 0) {
    erros["endereco.numero"] = "Informe um numero inteiro nao negativo.";
  }

  if (
    erros["endereco.rua"] ||
    erros["endereco.bairro"] ||
    erros["endereco.cep"] ||
    erros["endereco.numero"]
  ) {
    return undefined;
  }

  return { rua, numero, bairro, cep };
}

export function validarIdPredio(id: unknown): string {
  if (!ehObjectId(id)) throw new ValidationError("Id de predio invalido.");
  return id;
}

export function validarFiltrosPredios(query: unknown): FiltrosListagemPredios {
  if (!ehObjeto(query)) return {};
  const erros: Erros = {};
  const filtros: FiltrosListagemPredios = {};

  if (query.setorId !== undefined || query.setor !== undefined) {
    erros.setorId = "O campo setor/setorId foi removido do modelo; predios possuem salas diretamente.";
  }

  if (query.nome !== undefined) {
    if (typeof query.nome !== "string" || query.nome.trim() === "") {
      erros.nome = "Informe um termo de busca nao vazio.";
    } else {
      filtros.nome = query.nome.trim();
    }
  }

  const incluirSalas = lerBooleanoQuery(query.incluirSalas, "incluirSalas", erros);
  if (incluirSalas !== undefined) filtros.incluirSalas = incluirSalas;

  const incluirInativas = lerBooleanoQuery(query.incluirInativas, "incluirInativas", erros);
  if (incluirInativas !== undefined) filtros.incluirInativas = incluirInativas;

  if (Object.keys(erros).length > 0) {
    throw new ValidationError("Filtros de predios invalidos.", erros);
  }

  return filtros;
}

export function validarCriacaoPredio(corpo: unknown): CriarPredioDados {
  if (!ehObjeto(corpo)) throw new ValidationError("O corpo da requisicao deve ser um objeto JSON.");
  const erros: Erros = {};

  const nome = typeof corpo.nome === "string" ? corpo.nome.trim() : "";
  if (!nome) {
    erros.nome = "Nome do predio e obrigatorio.";
  }

  if (corpo.campusId !== undefined && corpo.campusId !== null && !ehObjectId(corpo.campusId)) {
    erros.campusId = "Id de campus invalido.";
  }
  if (corpo.setorId !== undefined || corpo.setor !== undefined) {
    erros.setorId = "O campo setor/setorId foi removido do modelo; predios possuem salas diretamente.";
  }

  const endereco = lerEndereco(corpo.endereco, erros);

  if (Object.keys(erros).length > 0) {
    throw new ValidationError("Dados do predio invalidos.", erros);
  }

  return {
    nome,
    ...(corpo.campusId !== undefined ? { campusId: (corpo.campusId as string | null) ?? null } : {}),
    ...(endereco !== undefined ? { endereco } : {}),
  };
}

export function validarAtualizacaoPredio(corpo: unknown): AtualizarPredioDados {
  if (!ehObjeto(corpo)) throw new ValidationError("O corpo da requisicao deve ser um objeto JSON.");
  const erros: Erros = {};
  const dados: AtualizarPredioDados = {};

  if (corpo.setorId !== undefined || corpo.setor !== undefined) {
    erros.setorId = "O campo setor/setorId foi removido do modelo; predios possuem salas diretamente.";
  }

  if (corpo.nome !== undefined) {
    if (typeof corpo.nome !== "string" || corpo.nome.trim() === "") {
      erros.nome = "Nome do predio nao pode ser vazio.";
    } else {
      dados.nome = corpo.nome.trim();
    }
  }

  if (corpo.campusId !== undefined) {
    if (corpo.campusId !== null && !ehObjectId(corpo.campusId)) {
      erros.campusId = "Id de campus invalido.";
    } else {
      dados.campusId = (corpo.campusId as string | null) ?? null;
    }
  }

  const endereco = lerEndereco(corpo.endereco, erros);
  if (endereco !== undefined) dados.endereco = endereco;

  if (Object.keys(erros).length > 0) {
    throw new ValidationError("Dados de atualizacao do predio invalidos.", erros);
  }

  if (Object.keys(dados).length === 0) {
    throw new ValidationError("Informe ao menos um campo para atualizar o predio.");
  }

  return dados;
}

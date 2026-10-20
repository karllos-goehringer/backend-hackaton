import { TipoSala } from "@prisma/client";
import { ValidationError } from "../../shared/errors/app-error.js";
import { ehObjectId } from "../../shared/validation/object-id.js";
import type {
  AtualizarSalaDados,
  CriarSalaDados,
  FiltrosBuscaSalas,
} from "./salas.repository.js";

type Erros = Record<string, string>;

const TIPOS_SALA = Object.values(TipoSala);

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

function lerInteiroPositivoQuery(valor: unknown, campo: string, erros: Erros): number | undefined {
  if (valor === undefined) return undefined;
  const numero = typeof valor === "number" ? valor : typeof valor === "string" && valor.trim() !== "" ? Number(valor) : NaN;
  if (!Number.isInteger(numero) || numero < 1) {
    erros[campo] = "Informe um numero inteiro positivo (>= 1).";
    return undefined;
  }
  return numero;
}

function lerCapacidadeCorpo(valor: unknown, erros: Erros): number | null | undefined {
  if (valor === undefined) return undefined;
  if (valor === null) return null;
  if (typeof valor !== "number" || !Number.isInteger(valor) || valor < 1) {
    erros.capacidade = "Capacidade deve ser um inteiro positivo (>= 1) ou null quando nao informada.";
    return undefined;
  }
  return valor;
}

export function validarIdSala(id: unknown): string {
  if (!ehObjectId(id)) throw new ValidationError("Id de sala invalido.");
  return id;
}

export function validarFiltrosSalas(query: unknown): FiltrosBuscaSalas {
  if (!ehObjeto(query)) return {};
  const erros: Erros = {};
  const filtros: FiltrosBuscaSalas = {};

  if (query.setorId !== undefined || query.setor !== undefined) {
    erros.setorId = "O campo setor/setorId foi removido do modelo; salas vinculam-se diretamente ao predio.";
  }

  if (query.predioId !== undefined) {
    if (!ehObjectId(query.predioId)) erros.predioId = "Id de predio invalido.";
    else filtros.predioId = query.predioId;
  }

  if (query.predioNome !== undefined) {
    if (typeof query.predioNome !== "string" || query.predioNome.trim() === "") {
      erros.predioNome = "Informe um nome de predio nao vazio.";
    } else {
      filtros.predioNome = query.predioNome.trim();
    }
  }

  if (query.nome !== undefined) {
    if (typeof query.nome !== "string" || query.nome.trim() === "") {
      erros.nome = "Informe um termo de busca nao vazio.";
    } else {
      filtros.nome = query.nome.trim();
    }
  }

  const capacidadeMin = lerInteiroPositivoQuery(query.capacidadeMin, "capacidadeMin", erros);
  if (capacidadeMin !== undefined) filtros.capacidadeMin = capacidadeMin;

  const capacidadeMax = lerInteiroPositivoQuery(query.capacidadeMax, "capacidadeMax", erros);
  if (capacidadeMax !== undefined) filtros.capacidadeMax = capacidadeMax;

  if (
    capacidadeMin !== undefined &&
    capacidadeMax !== undefined &&
    capacidadeMin > capacidadeMax
  ) {
    erros.capacidadeMax = "capacidadeMax deve ser maior ou igual a capacidadeMin.";
  }

  const apenasComCapacidade = lerBooleanoQuery(
    query.apenasComCapacidade,
    "apenasComCapacidade",
    erros,
  );
  if (apenasComCapacidade !== undefined) filtros.apenasComCapacidade = apenasComCapacidade;

  const semCapacidade = lerBooleanoQuery(query.semCapacidade, "semCapacidade", erros);
  if (semCapacidade !== undefined) filtros.semCapacidade = semCapacidade;

  if (filtros.apenasComCapacidade && filtros.semCapacidade) {
    erros.semCapacidade = "Nao e possivel combinar apenasComCapacidade=true e semCapacidade=true.";
  }

  if (query.tipo !== undefined) {
    if (typeof query.tipo !== "string" || !TIPOS_SALA.includes(query.tipo as TipoSala)) {
      erros.tipo = `Valores aceitos: ${TIPOS_SALA.join(", ")}.`;
    } else {
      filtros.tipo = query.tipo as TipoSala;
    }
  }

  const incluirInativas = lerBooleanoQuery(query.incluirInativas, "incluirInativas", erros);
  if (incluirInativas !== undefined) filtros.incluirInativas = incluirInativas;

  if (Object.keys(erros).length > 0) {
    throw new ValidationError("Filtros de salas invalidos.", erros);
  }

  return filtros;
}

export function validarCriacaoSala(corpo: unknown): CriarSalaDados {
  if (!ehObjeto(corpo)) throw new ValidationError("O corpo da requisicao deve ser um objeto JSON.");
  const erros: Erros = {};

  if (corpo.setorId !== undefined || corpo.setor !== undefined) {
    erros.setorId = "O campo setor/setorId foi removido do modelo; salas vinculam-se diretamente ao predio.";
  }

  if (!ehObjectId(corpo.predioId)) {
    erros.predioId = "Informe um id de predio valido.";
  }

  const nomeBruto = corpo.nomeSala !== undefined ? corpo.nomeSala : corpo.nome;
  const nomeSala = typeof nomeBruto === "string" ? nomeBruto.trim() : "";
  if (!nomeSala) {
    erros.nome = "Nome da sala e obrigatorio.";
  }

  const capacidade = lerCapacidadeCorpo(corpo.capacidade, erros);

  let codigo: string | null | undefined;
  if (corpo.codigo !== undefined) {
    if (corpo.codigo === null) codigo = null;
    else if (typeof corpo.codigo === "string" && corpo.codigo.trim() !== "") codigo = corpo.codigo.trim();
    else erros.codigo = "Codigo da sala deve ser texto nao vazio ou null.";
  }

  let numSala: number | null | undefined;
  if (corpo.numSala !== undefined) {
    if (corpo.numSala === null) numSala = null;
    else if (typeof corpo.numSala === "number" && Number.isInteger(corpo.numSala) && corpo.numSala >= 0) {
      numSala = corpo.numSala;
    } else {
      erros.numSala = "numSala deve ser inteiro nao negativo ou null.";
    }
  }

  let andar: number | null | undefined;
  if (corpo.andar !== undefined) {
    if (corpo.andar === null) andar = null;
    else if (typeof corpo.andar === "number" && Number.isInteger(corpo.andar)) andar = corpo.andar;
    else erros.andar = "andar deve ser inteiro ou null.";
  }

  let tipo: TipoSala | null | undefined;
  if (corpo.tipo !== undefined) {
    if (corpo.tipo === null) tipo = null;
    else if (typeof corpo.tipo === "string" && TIPOS_SALA.includes(corpo.tipo as TipoSala)) {
      tipo = corpo.tipo as TipoSala;
    } else {
      erros.tipo = `Valores aceitos: ${TIPOS_SALA.join(", ")} ou null.`;
    }
  }

  let ativa: boolean | undefined;
  if (corpo.ativa !== undefined) {
    if (typeof corpo.ativa === "boolean") ativa = corpo.ativa;
    else erros.ativa = "ativa deve ser booleano.";
  }

  if (Object.keys(erros).length > 0) {
    throw new ValidationError("Dados da sala invalidos.", erros);
  }

  return {
    predioId: corpo.predioId as string,
    nomeSala,
    capacidade: capacidade ?? null,
    ...(codigo !== undefined ? { codigo } : {}),
    ...(numSala !== undefined ? { numSala } : {}),
    ...(andar !== undefined ? { andar } : {}),
    ...(tipo !== undefined ? { tipo } : {}),
    ...(ativa !== undefined ? { ativa } : {}),
  };
}

export function validarAtualizacaoSala(corpo: unknown): AtualizarSalaDados {
  if (!ehObjeto(corpo)) throw new ValidationError("O corpo da requisicao deve ser um objeto JSON.");
  const erros: Erros = {};
  const dados: AtualizarSalaDados = {};

  if (corpo.setorId !== undefined || corpo.setor !== undefined) {
    erros.setorId = "O campo setor/setorId foi removido do modelo; salas vinculam-se diretamente ao predio.";
  }

  if (corpo.predioId !== undefined) {
    if (!ehObjectId(corpo.predioId)) erros.predioId = "Informe um id de predio valido.";
    else dados.predioId = corpo.predioId;
  }

  const nomeBruto = corpo.nomeSala !== undefined ? corpo.nomeSala : corpo.nome;
  if (nomeBruto !== undefined) {
    if (typeof nomeBruto !== "string" || nomeBruto.trim() === "") {
      erros.nome = "Nome da sala nao pode ser vazio.";
    } else {
      dados.nomeSala = nomeBruto.trim();
    }
  }

  if (corpo.capacidade !== undefined) {
    const capacidade = lerCapacidadeCorpo(corpo.capacidade, erros);
    if (!erros.capacidade) dados.capacidade = capacidade ?? null;
  }

  if (corpo.codigo !== undefined) {
    if (corpo.codigo === null) dados.codigo = null;
    else if (typeof corpo.codigo === "string" && corpo.codigo.trim() !== "") dados.codigo = corpo.codigo.trim();
    else erros.codigo = "Codigo da sala deve ser texto nao vazio ou null.";
  }

  if (corpo.numSala !== undefined) {
    if (corpo.numSala === null) dados.numSala = null;
    else if (typeof corpo.numSala === "number" && Number.isInteger(corpo.numSala) && corpo.numSala >= 0) {
      dados.numSala = corpo.numSala;
    } else {
      erros.numSala = "numSala deve ser inteiro nao negativo ou null.";
    }
  }

  if (corpo.andar !== undefined) {
    if (corpo.andar === null) dados.andar = null;
    else if (typeof corpo.andar === "number" && Number.isInteger(corpo.andar)) dados.andar = corpo.andar;
    else erros.andar = "andar deve ser inteiro ou null.";
  }

  if (corpo.tipo !== undefined) {
    if (corpo.tipo === null) dados.tipo = null;
    else if (typeof corpo.tipo === "string" && TIPOS_SALA.includes(corpo.tipo as TipoSala)) {
      dados.tipo = corpo.tipo as TipoSala;
    } else {
      erros.tipo = `Valores aceitos: ${TIPOS_SALA.join(", ")} ou null.`;
    }
  }

  if (corpo.ativa !== undefined) {
    if (typeof corpo.ativa === "boolean") dados.ativa = corpo.ativa;
    else erros.ativa = "ativa deve ser booleano.";
  }

  if (Object.keys(erros).length > 0) {
    throw new ValidationError("Dados de atualizacao da sala invalidos.", erros);
  }

  if (Object.keys(dados).length === 0) {
    throw new ValidationError("Informe ao menos um campo para atualizar a sala.");
  }

  return dados;
}

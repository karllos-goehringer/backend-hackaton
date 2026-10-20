import { DiaSemana, StatusReserva, TipoRecorrencia } from "@prisma/client";
import { ValidationError } from "../../shared/errors/app-error.js";
import { ehObjectId } from "../../shared/validation/object-id.js";
import type { NovaReservaCommand, RegraRecorrencia, TipoRecorrenciaSerie } from "./domain/reserva.types.js";
import type { FiltrosListagemReservas } from "./reservas.repository.js";

/**
 * Validacao de FORMA dos payloads HTTP (tipos, formatos, campos obrigatorios).
 * Regras de negocio ficam no dominio/service.
 */

type Erros = Record<string, string>;

const DATA_HORA_ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})$/;
const DATA_CIVIL = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIPOS_SERIE: readonly TipoRecorrenciaSerie[] = [
  TipoRecorrencia.SEMANAL,
  TipoRecorrencia.MENSAL,
  TipoRecorrencia.SEMESTRAL,
  TipoRecorrencia.ANUAL,
];
const DIAS_SEMANA = Object.values(DiaSemana);
const STATUS_RESERVA = Object.values(StatusReserva);

function ehObjeto(valor: unknown): valor is Record<string, unknown> {
  return typeof valor === "object" && valor !== null && !Array.isArray(valor);
}

function lerDataHora(valor: unknown, campo: string, erros: Erros): Date | undefined {
  if (typeof valor !== "string" || !DATA_HORA_ISO.test(valor)) {
    erros[campo] = "Informe data/hora ISO 8601 com fuso (ex.: 2026-10-20T13:00:00-03:00).";
    return undefined;
  }
  const data = new Date(valor);
  if (Number.isNaN(data.getTime())) {
    erros[campo] = "Data/hora invalida.";
    return undefined;
  }
  return data;
}

function lerDataCivil(valor: unknown, campo: string, erros: Erros): Date | undefined {
  const match = typeof valor === "string" ? DATA_CIVIL.exec(valor) : null;
  if (!match) {
    erros[campo] = "Informe a data no formato AAAA-MM-DD.";
    return undefined;
  }
  const [ano, mes, dia] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const data = new Date(Date.UTC(ano, mes - 1, dia));
  if (data.getUTCFullYear() !== ano || data.getUTCMonth() !== mes - 1 || data.getUTCDate() !== dia) {
    erros[campo] = "Data inexistente.";
    return undefined;
  }
  return data;
}

function lerTextoObrigatorio(valor: unknown, campo: string, erros: Erros): string | undefined {
  if (typeof valor !== "string" || valor.trim() === "") {
    erros[campo] = "Campo obrigatorio.";
    return undefined;
  }
  return valor.trim();
}

function lerRecorrencia(valor: unknown, erros: Erros): RegraRecorrencia | undefined {
  if (!ehObjeto(valor)) {
    erros.recorrencia = "Deve ser um objeto { tipo, dataFim?, diasSemana? }.";
    return undefined;
  }

  const tipo = valor.tipo;
  if (typeof tipo !== "string" || !TIPOS_SERIE.includes(tipo as TipoRecorrenciaSerie)) {
    erros["recorrencia.tipo"] = `Valores aceitos: ${TIPOS_SERIE.join(", ")}.`;
  }

  let dataFim: Date | undefined;
  if (valor.dataFim !== undefined || tipo === TipoRecorrencia.SEMANAL) {
    dataFim = lerDataCivil(valor.dataFim, "recorrencia.dataFim", erros);
  }

  let diasSemana: DiaSemana[] = [];
  if (tipo === TipoRecorrencia.SEMANAL || valor.diasSemana !== undefined) {
    const dias = valor.diasSemana;
    if (
      !Array.isArray(dias) ||
      (tipo === TipoRecorrencia.SEMANAL && dias.length === 0) ||
      !dias.every((d): d is DiaSemana => typeof d === "string" && DIAS_SEMANA.includes(d as DiaSemana))
    ) {
      erros["recorrencia.diasSemana"] = `Valores aceitos: ${DIAS_SEMANA.join(", ")}.`;
    } else {
      diasSemana = [...new Set(dias)];
    }
  }

  if ((tipo === TipoRecorrencia.SEMANAL && !dataFim) || erros["recorrencia.tipo"] || erros["recorrencia.dataFim"] || erros["recorrencia.diasSemana"]) {
    return undefined;
  }
  return {
    tipo: tipo as TipoRecorrenciaSerie,
    ...(dataFim ? { dataFim } : {}),
    diasSemana,
  };
}

export function validarCriacaoReserva(corpo: unknown): NovaReservaCommand {
  if (!ehObjeto(corpo)) throw new ValidationError("O corpo da requisicao deve ser um objeto JSON.");

  const erros: Erros = {};

  if (!ehObjectId(corpo.salaId)) erros.salaId = "Informe um id de sala valido.";
  const dataHoraInicio = lerDataHora(corpo.dataHoraInicio, "dataHoraInicio", erros);
  const dataHoraFim = lerDataHora(corpo.dataHoraFim, "dataHoraFim", erros);
  const finalidade = lerTextoObrigatorio(corpo.finalidade, "finalidade", erros);

  if (corpo.responsavelId !== undefined && !ehObjectId(corpo.responsavelId)) {
    erros.responsavelId = "Informe um id de usuario valido.";
  }
  const observacoes = typeof corpo.observacoes === "string" ? corpo.observacoes.trim() : undefined;
  const recorrencia = corpo.recorrencia === undefined ? undefined : lerRecorrencia(corpo.recorrencia, erros);

  if (Object.keys(erros).length > 0 || !dataHoraInicio || !dataHoraFim || !finalidade) {
    throw new ValidationError("Dados da reserva invalidos.", erros);
  }

  return {
    salaId: corpo.salaId as string,
    dataHoraInicio,
    dataHoraFim,
    finalidade,
    ...(observacoes ? { observacoes } : {}),
    ...(corpo.responsavelId !== undefined ? { responsavelId: corpo.responsavelId as string } : {}),
    ...(recorrencia ? { recorrencia } : {}),
  };
}

export function validarFiltrosListagem(query: unknown): FiltrosListagemReservas {
  if (!ehObjeto(query)) return {};
  const erros: Erros = {};
  const filtros: FiltrosListagemReservas = {};

  if (query.salaId !== undefined) {
    if (!ehObjectId(query.salaId)) erros.salaId = "Id de sala invalido.";
    else filtros.salaId = query.salaId;
  }
  if (query.predioId !== undefined) {
    if (!ehObjectId(query.predioId)) erros.predioId = "Id de predio invalido.";
    else filtros.predioId = query.predioId;
  }
  if (query.solicitanteId !== undefined) {
    if (!ehObjectId(query.solicitanteId)) erros.solicitanteId = "Id de solicitante invalido.";
    else filtros.solicitanteId = query.solicitanteId;
  }
  if (query.responsavelId !== undefined) {
    if (!ehObjectId(query.responsavelId)) erros.responsavelId = "Id de responsavel invalido.";
    else filtros.responsavelId = query.responsavelId;
  }
  if (query.status !== undefined) {
    if (typeof query.status !== "string" || !STATUS_RESERVA.includes(query.status as StatusReserva)) {
      erros.status = `Valores aceitos: ${STATUS_RESERVA.join(", ")}.`;
    } else {
      filtros.status = query.status as StatusReserva;
    }
  }
  if (query.data !== undefined) {
    const data = lerDataCivil(query.data, "data", erros);
    if (data) {
      filtros.inicio = data;
      filtros.fim = new Date(data.getTime() + 24 * 60 * 60 * 1000);
    }
  }

  if (Object.keys(erros).length > 0) {
    throw new ValidationError("Filtros de consulta invalidos.", erros);
  }
  return filtros;
}

export function validarIdReserva(id: unknown): string {
  if (!ehObjectId(id)) throw new ValidationError("Id de reserva invalido.");
  return id;
}

export function validarMotivoRejeicao(corpo: unknown): string {
  const erros: Erros = {};
  const motivo = lerTextoObrigatorio(ehObjeto(corpo) ? corpo.motivo : undefined, "motivo", erros);
  if (!motivo) throw new ValidationError("Informe o motivo da rejeicao.", erros);
  return motivo;
}

export function validarJustificativaCancelamento(corpo: unknown): string {
  const erros: Erros = {};
  const justificativa = lerTextoObrigatorio(
    ehObjeto(corpo) ? corpo.justificativa : undefined,
    "justificativa",
    erros,
  );
  if (!justificativa) throw new ValidationError("Informe a justificativa do cancelamento.", erros);
  return justificativa;
}

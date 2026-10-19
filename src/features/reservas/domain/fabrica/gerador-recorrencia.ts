import { DiaSemana, TipoRecorrencia } from "@prisma/client";
import { BusinessRuleError } from "../../../../shared/errors/app-error.js";
import { dataCivil, diasNoMes, localParaUtc, partesLocais } from "../../../../shared/utils/data-hora.js";
import type { Ocorrencia, RegraRecorrencia } from "../reserva.types.js";

const DIA_SEMANA_POR_INDICE: readonly DiaSemana[] = [
  DiaSemana.DOMINGO,
  DiaSemana.SEGUNDA,
  DiaSemana.TERCA,
  DiaSemana.QUARTA,
  DiaSemana.QUINTA,
  DiaSemana.SEXTA,
  DiaSemana.SABADO,
];

const PASSO_MESES: Record<Exclude<RegraRecorrencia["tipo"], "SEMANAL">, number> = {
  [TipoRecorrencia.MENSAL]: 1,
  [TipoRecorrencia.SEMESTRAL]: 6,
  [TipoRecorrencia.ANUAL]: 12,
};

const UM_DIA_MS = 86_400_000;

/**
 * Expande a primeira ocorrencia em todas as ocorrencias da serie, preservando o horario de parede
 * no fuso institucional e a duracao original.
 * - SEMANAL: todo dia do periodo cujo dia da semana esteja em `diasSemana`.
 * - MENSAL / SEMESTRAL / ANUAL: mesmo dia do mes a cada 1 / 6 / 12 meses; meses sem esse dia sao pulados.
 */
export class GeradorRecorrencia {
  gerar(primeira: Ocorrencia, regra: RegraRecorrencia): Ocorrencia[] {
    const duracaoMs = primeira.fim.getTime() - primeira.inicio.getTime();
    const horario = partesLocais(primeira.inicio);
    const inicioSerie = dataCivil(primeira.inicio);

    if (regra.dataFim.getTime() < inicioSerie.getTime()) {
      throw new BusinessRuleError("A data final da recorrencia e anterior a data da primeira ocorrencia.");
    }

    const datas =
      regra.tipo === TipoRecorrencia.SEMANAL
        ? this.datasSemanais(inicioSerie, regra.dataFim, regra.diasSemana)
        : this.datasMensais(inicioSerie, regra.dataFim, PASSO_MESES[regra.tipo]);

    const ocorrencias = datas.map((data) => {
      const inicio = localParaUtc({
        ...horario,
        ano: data.getUTCFullYear(),
        mes: data.getUTCMonth() + 1,
        dia: data.getUTCDate(),
      });
      return { inicio, fim: new Date(inicio.getTime() + duracaoMs) };
    });

    if (ocorrencias.length === 0) {
      throw new BusinessRuleError("A recorrencia informada nao gera nenhuma ocorrencia no periodo.");
    }
    return ocorrencias;
  }

  private datasSemanais(inicio: Date, fim: Date, diasSemana: readonly DiaSemana[]): Date[] {
    const dias = new Set(diasSemana);
    const datas: Date[] = [];
    for (let t = inicio.getTime(); t <= fim.getTime(); t += UM_DIA_MS) {
      const data = new Date(t);
      if (dias.has(DIA_SEMANA_POR_INDICE[data.getUTCDay()])) datas.push(data);
    }
    return datas;
  }

  private datasMensais(inicio: Date, fim: Date, passoMeses: number): Date[] {
    const dia = inicio.getUTCDate();
    const mesBase = inicio.getUTCFullYear() * 12 + inicio.getUTCMonth();
    const datas: Date[] = [];
    for (let k = 0; ; k++) {
      const mesAbsoluto = mesBase + k * passoMeses;
      const ano = Math.floor(mesAbsoluto / 12);
      const mes = mesAbsoluto % 12; // 0-11
      if (Date.UTC(ano, mes, 1) > fim.getTime()) break;
      if (dia > diasNoMes(ano, mes + 1)) continue;
      const data = new Date(Date.UTC(ano, mes, dia));
      if (data.getTime() > fim.getTime()) break;
      datas.push(data);
    }
    return datas;
  }
}


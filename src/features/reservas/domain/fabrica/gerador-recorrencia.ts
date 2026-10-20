import { DiaSemana, TipoRecorrencia } from "@prisma/client";
import { BusinessRuleError } from "../../../../shared/errors/app-error.js";
import { dataCivil, diasNoMes, localParaUtc, partesLocais } from "../../../../shared/utils/data-hora.js";
import { getDiaDaSemana, type Ocorrencia, type RegraRecorrencia, type TipoRecorrenciaSerie } from "../reserva.types.js";

const DIA_SEMANA_POR_INDICE: readonly DiaSemana[] = [
  DiaSemana.DOMINGO,
  DiaSemana.SEGUNDA,
  DiaSemana.TERCA,
  DiaSemana.QUARTA,
  DiaSemana.QUINTA,
  DiaSemana.SEXTA,
  DiaSemana.SABADO,
];

const DURACAO_MESES_POR_FREQUENCIA: Record<Exclude<TipoRecorrenciaSerie, "SEMANAL">, number> = {
  [TipoRecorrencia.MENSAL]: 1,
  [TipoRecorrencia.SEMESTRAL]: 6,
  [TipoRecorrencia.ANUAL]: 12,
};

const UM_DIA_MS = 86_400_000;

export function adicionarMesesCivis(inicio: Date, meses: number): Date {
  const mesAbsoluto = inicio.getUTCFullYear() * 12 + inicio.getUTCMonth() + meses;
  const ano = Math.floor(mesAbsoluto / 12);
  const mes = mesAbsoluto % 12; // 0-11
  const dia = Math.min(inicio.getUTCDate(), diasNoMes(ano, mes + 1));
  return new Date(Date.UTC(ano, mes, dia));
}

export function resolverDataFimRecorrencia(inicioSerie: Date, regra: RegraRecorrencia): Date {
  if (regra.dataFim) return regra.dataFim;
  if (regra.tipo === TipoRecorrencia.SEMANAL) {
    throw new BusinessRuleError("Para recorrencia SEMANAL, informe a dataFim da serie.");
  }
  return adicionarMesesCivis(inicioSerie, DURACAO_MESES_POR_FREQUENCIA[regra.tipo]);
}

export function resolverDiasSemanaRecorrencia(primeiraInicio: Date, regra: RegraRecorrencia): DiaSemana[] {
  if (regra.diasSemana.length > 0) return regra.diasSemana;
  return [getDiaDaSemana(primeiraInicio)];
}

/**
 * Expande a primeira ocorrencia em todas as ocorrencias da serie, preservando o horario de parede
 * no fuso institucional e a duracao original (50 min).
 *
 * Conforme a anotacao do diagrama em ReservaCoordenador ("qual a frequencia desse dia e horario da semana"):
 * - SEMANAL / MENSAL / SEMESTRAL / ANUAL repetem semanalmente o(s) dia(s) da semana e horario
 *   ao longo do periodo (ate `dataFim` informada ou pelo horizonte de 1, 6 ou 12 meses).
 */
export class GeradorRecorrencia {
  gerar(primeira: Ocorrencia, regra: RegraRecorrencia): Ocorrencia[] {
    const duracaoMs = primeira.fim.getTime() - primeira.inicio.getTime();
    const horario = partesLocais(primeira.inicio);
    const inicioSerie = dataCivil(primeira.inicio);
    const fimSerie = resolverDataFimRecorrencia(inicioSerie, regra);
    const diasSemana = resolverDiasSemanaRecorrencia(primeira.inicio, regra);

    if (fimSerie.getTime() < inicioSerie.getTime()) {
      throw new BusinessRuleError("A data final da recorrencia e anterior a data da primeira ocorrencia.");
    }

    const datas = this.datasSemanais(inicioSerie, fimSerie, diasSemana);

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
}

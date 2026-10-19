import { DiaSemana, type TipoRecorrencia } from "@prisma/client";
import { dataCivil } from "../../../shared/utils/data-hora.js";

/** Intervalo semiaberto [inicio, fim) de uma alocacao de sala. */
export interface Ocorrencia {
  inicio: Date;
  fim: Date;
}

export type TipoRecorrenciaSerie = Exclude<TipoRecorrencia, "UNICA">;

export interface RegraRecorrencia {
  tipo: TipoRecorrenciaSerie;
  /** Data civil (00:00 UTC) da ultima ocorrencia possivel, inclusiva. Se omitida em MENSAL/SEMESTRAL/ANUAL, usa a duracao da frequencia. */
  dataFim?: Date;
  /** Dias da semana da repeticao. Se vazio, assume o dia da semana de dataHoraInicio. */
  diasSemana: DiaSemana[];
}

export interface NovaReservaCommand {
  salaId: string;
  dataHoraInicio: Date;
  dataHoraFim: Date;
  finalidade: string;
  observacoes?: string;
  responsavelId?: string;
  recorrencia?: RegraRecorrencia;
}

const DIA_SEMANA_POR_INDICE: readonly DiaSemana[] = [
  DiaSemana.DOMINGO,
  DiaSemana.SEGUNDA,
  DiaSemana.TERCA,
  DiaSemana.QUARTA,
  DiaSemana.QUINTA,
  DiaSemana.SEXTA,
  DiaSemana.SABADO,
];

/**
 * Operacao do diagrama `Reserva.getDiaDaSemana()`: obtem o dia da semana no fuso institucional
 * (`America/Sao_Paulo`) sem persistir campo redundante no MongoDB.
 */
export function getDiaDaSemana(reservaOuData: { dataHoraInicio: Date } | Date): DiaSemana {
  const instante = reservaOuData instanceof Date ? reservaOuData : reservaOuData.dataHoraInicio;
  const civil = dataCivil(instante);
  return DIA_SEMANA_POR_INDICE[civil.getUTCDay()];
}

export type ComDiaDaSemana<T extends { dataHoraInicio: Date }> = T & {
  diaDaSemana: DiaSemana;
};

export function anexarDiaDaSemana<T extends { dataHoraInicio: Date }>(reserva: T): ComDiaDaSemana<T> {
  return {
    ...reserva,
    diaDaSemana: getDiaDaSemana(reserva),
  };
}

/** Duas ocorrencias conflitam se os intervalos semiabertos se sobrepoem (14:40 termina / 14:40 comeca = ok). */
export function sobrepoe(a: Ocorrencia, b: Ocorrencia): boolean {
  return a.inicio.getTime() < b.fim.getTime() && b.inicio.getTime() < a.fim.getTime();
}

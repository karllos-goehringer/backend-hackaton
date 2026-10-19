import type { DiaSemana, TipoRecorrencia } from "@prisma/client";

/** Intervalo semiaberto [inicio, fim) de uma alocacao de sala. */
export interface Ocorrencia {
  inicio: Date;
  fim: Date;
}

export type TipoRecorrenciaSerie = Exclude<TipoRecorrencia, "UNICA">;

export interface RegraRecorrencia {
  tipo: TipoRecorrenciaSerie;
  /** Data civil (00:00 UTC) da ultima ocorrencia possivel, inclusiva. */
  dataFim: Date;
  /** Usado apenas em SEMANAL. */
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

/** Duas ocorrencias conflitam se os intervalos semiabertos se sobrepoem (14:40 termina / 14:40 comeca = ok). */
export function sobrepoe(a: Ocorrencia, b: Ocorrencia): boolean {
  return a.inicio.getTime() < b.fim.getTime() && b.inicio.getTime() < a.fim.getTime();
}


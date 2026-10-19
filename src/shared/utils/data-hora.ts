/**
 * Utilitarios de data/hora no fuso institucional, sem dependencias externas (Intl nativo).
 *
 * Convencoes:
 * - Instantes (dataHoraInicio/Fim) sao `Date` em UTC.
 * - Datas civis (portarias, inicio/fim de serie) sao `Date` a 00:00 UTC do dia civil.
 */
export const FUSO_INSTITUCIONAL = "America/Sao_Paulo";

export interface PartesLocais {
  ano: number;
  mes: number; // 1-12
  dia: number;
  hora: number;
  minuto: number;
  segundo: number;
  milissegundo: number;
}

const formatadores = new Map<string, Intl.DateTimeFormat>();

function formatador(fuso: string): Intl.DateTimeFormat {
  let f = formatadores.get(fuso);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone: fuso,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    formatadores.set(fuso, f);
  }
  return f;
}

export function partesLocais(instante: Date, fuso = FUSO_INSTITUCIONAL): PartesLocais {
  const partes: Record<string, number> = {};
  for (const p of formatador(fuso).formatToParts(instante)) {
    if (p.type !== "literal") partes[p.type] = Number(p.value);
  }
  return {
    ano: partes.year,
    mes: partes.month,
    dia: partes.day,
    hora: partes.hour,
    minuto: partes.minute,
    segundo: partes.second,
    milissegundo: instante.getUTCMilliseconds(),
  };
}

/** Diferenca (ms) entre o horario local do fuso e UTC no instante informado. */
function deslocamento(instante: Date, fuso: string): number {
  const p = partesLocais(instante, fuso);
  const comoUtc = Date.UTC(p.ano, p.mes - 1, p.dia, p.hora, p.minuto, p.segundo, p.milissegundo);
  return comoUtc - instante.getTime();
}

/** Converte um horario de parede no fuso informado para o instante UTC correspondente. */
export function localParaUtc(partes: PartesLocais, fuso = FUSO_INSTITUCIONAL): Date {
  const comoUtc = Date.UTC(
    partes.ano,
    partes.mes - 1,
    partes.dia,
    partes.hora,
    partes.minuto,
    partes.segundo,
    partes.milissegundo,
  );
  let instante = comoUtc - deslocamento(new Date(comoUtc), fuso);
  // Segunda passada corrige casos proximos a mudancas de offset.
  instante = comoUtc - deslocamento(new Date(instante), fuso);
  return new Date(instante);
}

/** Data civil (no fuso) do instante, representada a 00:00 UTC. */
export function dataCivil(instante: Date, fuso = FUSO_INSTITUCIONAL): Date {
  const p = partesLocais(instante, fuso);
  return new Date(Date.UTC(p.ano, p.mes - 1, p.dia));
}

export function diasNoMes(ano: number, mes: number): number {
  return new Date(Date.UTC(ano, mes, 0)).getUTCDate();
}


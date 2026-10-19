/**
 * Janela de funcionamento das salas no fuso institucional, configurada por ambiente:
 *   HORARIO_ABERTURA=HH:MM  HORARIO_FECHAMENTO=HH:MM
 * O documento de arquitetura nao define os horarios; sem as variaveis, a restricao de horario
 * nao e aplicada (somente a coerencia dos intervalos e validada).
 */
export interface JanelaFuncionamento {
  aberturaMinutos: number;
  fechamentoMinutos: number;
}

const HORARIO_REGEX = /^([01]\d|2[0-3]):([0-5]\d)$/;

function paraMinutos(nome: string, valor: string): number {
  const match = HORARIO_REGEX.exec(valor.trim());
  if (!match) throw new Error(`${nome} deve estar no formato HH:MM (recebido: "${valor}").`);
  return Number(match[1]) * 60 + Number(match[2]);
}

export function carregarJanelaFuncionamento(env: NodeJS.ProcessEnv = process.env): JanelaFuncionamento | null {
  const abertura = env.HORARIO_ABERTURA;
  const fechamento = env.HORARIO_FECHAMENTO;

  if (!abertura && !fechamento) return null;
  if (!abertura || !fechamento) {
    throw new Error("Configure HORARIO_ABERTURA e HORARIO_FECHAMENTO juntos (ou nenhum dos dois).");
  }

  const janela = {
    aberturaMinutos: paraMinutos("HORARIO_ABERTURA", abertura),
    fechamentoMinutos: paraMinutos("HORARIO_FECHAMENTO", fechamento),
  };
  if (janela.aberturaMinutos >= janela.fechamentoMinutos) {
    throw new Error("HORARIO_ABERTURA deve ser anterior a HORARIO_FECHAMENTO.");
  }
  return janela;
}


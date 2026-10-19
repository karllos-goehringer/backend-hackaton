import { Prisma, type PrismaClient } from "@prisma/client";

/**
 * Cliente aceito pelos repositories: o PrismaClient raiz ou o cliente de uma transacao interativa.
 * Permite reutilizar os mesmos repositories dentro e fora de `$transaction`.
 */
export type DbClient = Prisma.TransactionClient;

const CODIGO_CONFLITO_TRANSACAO = "P2034";

export interface OpcoesTransacao {
  tentativas?: number;
  timeoutMs?: number;
}

/**
 * Executa uma transacao interativa reexecutando-a em caso de write conflict (P2034).
 * No MongoDB, transacoes concorrentes que escrevem no mesmo documento conflitam; a reexecucao
 * relê o estado ja confirmado e refaz as validacoes. Requer MongoDB em replica set (Atlas atende).
 */
export async function executarTransacao<T>(
  prisma: PrismaClient,
  operacao: (tx: DbClient) => Promise<T>,
  { tentativas = 3, timeoutMs = 15_000 }: OpcoesTransacao = {},
): Promise<T> {
  for (let tentativa = 1; ; tentativa++) {
    try {
      return await prisma.$transaction(operacao, { timeout: timeoutMs });
    } catch (error) {
      const conflito =
        error instanceof Prisma.PrismaClientKnownRequestError && error.code === CODIGO_CONFLITO_TRANSACAO;
      if (!conflito || tentativa >= tentativas) throw error;
    }
  }
}


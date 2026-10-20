import type { DbClient } from "../../../shared/database/transacao.js";
import {
  DADOS_INICIAIS_PREDIOS_SALAS,
  type PredioInicialSeed,
} from "./dados-iniciais-predios-salas.js";

export interface ResultadoSeedPrediosSalas {
  prediosProcessados: number;
  prediosCriados: number;
  prediosExistentes: number;
  salasProcessadas: number;
  salasCriadas: number;
  salasExistentes: number;
}

/**
 * Inicializacao idempotente dos predios e salas iniciais.
 * - Preserva registros existentes sem sobrescrever campos ja populados.
 * - Evita duplicatas usando a chave unica `Predio.nome` e a chave composta `Sala(predioId, nomeSala)`.
 */
export async function semearPrediosESalasIniciais(
  db: DbClient,
  catalogo: readonly PredioInicialSeed[] = DADOS_INICIAIS_PREDIOS_SALAS,
): Promise<ResultadoSeedPrediosSalas> {
  let prediosProcessados = 0;
  let prediosCriados = 0;
  let prediosExistentes = 0;
  let salasProcessadas = 0;
  let salasCriadas = 0;
  let salasExistentes = 0;

  for (const predioSeed of catalogo) {
    prediosProcessados += 1;

    let predio = await db.predio.findUnique({
      where: { nome: predioSeed.nome },
      select: { id: true, nome: true },
    });

    if (!predio) {
      predio = await db.predio.create({
        data: { nome: predioSeed.nome },
        select: { id: true, nome: true },
      });
      prediosCriados += 1;
    } else {
      prediosExistentes += 1;
    }

    for (const salaSeed of predioSeed.salas) {
      salasProcessadas += 1;

      const existente = await db.sala.findUnique({
        where: {
          predioId_nomeSala: {
            predioId: predio.id,
            nomeSala: salaSeed.nome,
          },
        },
        select: { id: true },
      });

      if (!existente) {
        await db.sala.create({
          data: {
            predioId: predio.id,
            nomeSala: salaSeed.nome,
            capacidade: salaSeed.capacidade,
            ativa: true,
          },
          select: { id: true },
        });
        salasCriadas += 1;
      } else {
        salasExistentes += 1;
      }
    }
  }

  return {
    prediosProcessados,
    prediosCriados,
    prediosExistentes,
    salasProcessadas,
    salasCriadas,
    salasExistentes,
  };
}


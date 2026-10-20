import type { DbClient } from "../../../shared/database/transacao.js";
import { DEPARTAMENTOS_ELEGIVEIS, type DepartamentoElegivel } from "../departamentos-elegiveis.js";

export interface ResultadoSeedDepartamentos {
  processados: number;
  criados: number;
  existentes: number;
}

/**
 * Gera um ObjectId MongoDB determinístico de 24 caracteres hexadecimais para cada departamento.
 * Exemplo: index 0 -> 64b7f0c2a1b2c3d4e5f60101
 *          index 2 (CTI) -> 64b7f0c2a1b2c3d4e5f60103
 */
export function obterIdDeterministoDepartamento(index: number): string {
  const hex = (index + 1).toString(16).padStart(2, "0");
  return `64b7f0c2a1b2c3d4e5f601${hex}`;
}

/**
 * Inicialização idempotente dos departamentos no MongoDB.
 * - Cria os 27 departamentos do IFES na coleção Departamento caso não existam.
 * - Preserva registros existentes sem duplicar (chave única `nome`).
 */
export async function semearDepartamentosIniciais(
  db: DbClient,
  catalogo: readonly DepartamentoElegivel[] = DEPARTAMENTOS_ELEGIVEIS,
): Promise<ResultadoSeedDepartamentos> {
  let processados = 0;
  let criados = 0;
  let existentes = 0;

  for (let i = 0; i < catalogo.length; i++) {
    const dep = catalogo[i];
    processados += 1;

    const existente = await db.departamento.findUnique({
      where: { nome: dep.nome },
      select: { id: true, nome: true },
    });

    if (!existente) {
      await db.departamento.create({
        data: {
          id: obterIdDeterministoDepartamento(i),
          nome: dep.nome,
        },
      });
      criados += 1;
    } else {
      existentes += 1;
    }
  }

  return { processados, criados, existentes };
}


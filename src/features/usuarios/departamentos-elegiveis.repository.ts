import type { PrismaClient } from "@prisma/client";
import { DEPARTAMENTOS_ELEGIVEIS } from "./departamentos-elegiveis.js";

export const ID_CATALOGO_DEPARTAMENTOS = "departamentos-elegiveis-coordenacao";

export async function sincronizarCatalogoDepartamentos(prisma: PrismaClient): Promise<void> {
  const departamentos = DEPARTAMENTOS_ELEGIVEIS.map(({ id, nome, diretoria, sigla }) => ({
    id,
    nome,
    diretoria,
    ...(sigla ? { sigla } : {}),
  }));

  await prisma.catalogoDepartamentosCoordenacao.upsert({
    where: { id: ID_CATALOGO_DEPARTAMENTOS },
    create: { id: ID_CATALOGO_DEPARTAMENTOS, departamentos },
    update: { departamentos },
  });
}

import type { PrismaClient } from "@prisma/client";
import { DEPARTAMENTOS_ELEGIVEIS } from "./departamentos-elegiveis.js";
import { semearDepartamentosIniciais, obterIdDeterministoDepartamento } from "./seed/seed-departamentos.js";

export const ID_CATALOGO_DEPARTAMENTOS = "departamentos-elegiveis-coordenacao";

export async function sincronizarCatalogoDepartamentos(prisma: PrismaClient): Promise<void> {
  // Semeia a coleção Departamento idempotentemente
  await semearDepartamentosIniciais(prisma);

  // Mapeia os departamentos no banco para utilizar seus ObjectIds reais
  const departamentosBanco = await prisma.departamento.findMany({ select: { id: true, nome: true } });
  const mapaPorNome = new Map(departamentosBanco.map((d) => [d.nome, d.id]));

  const departamentos = DEPARTAMENTOS_ELEGIVEIS.map(({ nome, diretoria, sigla }, index) => ({
    id: mapaPorNome.get(nome) ?? obterIdDeterministoDepartamento(index),
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

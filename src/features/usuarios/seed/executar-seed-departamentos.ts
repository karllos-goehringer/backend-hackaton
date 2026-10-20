import { prisma, disconnectFromMongoDB } from "../../../shared/config/database.js";
import { semearDepartamentosIniciais } from "./seed-departamentos.js";
import { sincronizarCatalogoDepartamentos } from "../departamentos-elegiveis.repository.js";

async function main() {
  try {
    const resultado = await semearDepartamentosIniciais(prisma);
    await sincronizarCatalogoDepartamentos(prisma);
    console.log("Seed de departamentos concluido com sucesso:", resultado);
  } finally {
    await disconnectFromMongoDB();
  }
}

main().catch((erro) => {
  console.error("Erro ao executar seed de departamentos:", erro);
  process.exit(1);
});


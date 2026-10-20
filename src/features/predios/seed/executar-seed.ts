import { prisma, disconnectFromMongoDB } from "../../../shared/config/database.js";
import { semearPrediosESalasIniciais } from "./seed-predios-salas.js";

async function main() {
  try {
    const resultado = await semearPrediosESalasIniciais(prisma);
    console.log("Seed de predios e salas concluido com sucesso:", resultado);
  } finally {
    await disconnectFromMongoDB();
  }
}

main().catch((erro) => {
  console.error("Erro ao executar seed de predios e salas:", erro);
  process.exit(1);
});


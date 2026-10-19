import "dotenv/config";
import app from "./app";
import { connectToMongoDB, disconnectFromMongoDB } from "./shared/config/database";

const port = Number(process.env.PORT) || 3333;

async function startServer(): Promise<void> {
  await connectToMongoDB();

  const server = app.listen(port, () => {
    console.log(`Servidor Express rodando em http://localhost:${port}`);
    console.log(`Ambiente: ${process.env.NODE_ENV || "development"}`);
  });

  const shutdown = (): void => {
    server.close(() => {
      void disconnectFromMongoDB().finally(() => process.exit(0));
    });
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

void startServer().catch((error: unknown) => {
  console.error("Falha ao iniciar o servidor:", error);
  void disconnectFromMongoDB().finally(() => process.exit(1));
});
import "dotenv/config";
import { createServer } from "node:http";
import app from "./app";
import { notificacoesService } from "./features/cancelamentos/cancelamento.module.js";
import { NotificacoesWebSocket } from "./features/notificacoes/notificacoes.websocket.js";
import { UsuariosRepository } from "./features/usuarios/usuarios.repository.js";
import { connectToMongoDB, disconnectFromMongoDB, prisma } from "./shared/config/database.js";

const port = Number(process.env.PORT) || 3333;

async function startServer(): Promise<void> {
  await connectToMongoDB();

  const server = createServer(app);
  const notificacoesWebSocket = new NotificacoesWebSocket(
    server,
    notificacoesService,
    new UsuariosRepository(prisma),
  );
  server.listen(port, () => {
    console.log(`Servidor Express rodando em http://localhost:${port}`);
    console.log(`WebSocket de notificacoes em ws://localhost:${port}/notificacoes/ws`);
    console.log(`Ambiente: ${process.env.NODE_ENV || "development"}`);
  });

  let encerrando = false;
  const shutdown = (): void => {
    if (encerrando) return;
    encerrando = true;

    void (async () => {
      await notificacoesWebSocket.fechar();
      await new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }
          resolve();
        });
      });
      await disconnectFromMongoDB();
      process.exit(0);
    })().catch((error: unknown) => {
      console.error("Falha ao encerrar servidor:", error);
      process.exit(1);
    });
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

void startServer().catch((error: unknown) => {
  console.error("Falha ao iniciar o servidor:", error);
  void disconnectFromMongoDB().finally(() => process.exit(1));
});
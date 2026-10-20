import type { IncomingMessage, Server } from "node:http";
import type { Duplex } from "node:stream";
import jwt from "jsonwebtoken";
import { WebSocket, WebSocketServer } from "ws";
import { obterJwtSecret } from "../usuarios/usuarios.service.js";
import type { UsuariosRepository } from "../usuarios/usuarios.repository.js";
import type { NotificacaoEstadoReserva } from "./notificacao.types.js";
import type { NotificacoesService, ObservadorNotificacaoReserva } from "./notificacoes.service.js";

const CAMINHO_NOTIFICACOES = "/notificacoes/ws";

export class NotificacoesWebSocket implements ObservadorNotificacaoReserva {
  private readonly servidorWebSocket = new WebSocketServer({ noServer: true });
  private readonly conexoesPorUsuario = new Map<string, Set<WebSocket>>();
  private readonly removerObservador: () => void;
  private fechando = false;

  constructor(
    private readonly servidorHttp: Server,
    notificacoes: NotificacoesService,
    private readonly usuarios: UsuariosRepository,
  ) {
    this.servidorHttp.on("upgrade", this.aoAtualizarConexao);
    this.servidorWebSocket.on("error", (erro) => {
      console.error("[WEBSOCKET] Falha no servidor de notificacoes:", erro);
    });
    this.removerObservador = notificacoes.inscrever(this);
  }

  atualizar(notificacao: NotificacaoEstadoReserva): void {
    const conexoes = this.conexoesPorUsuario.get(notificacao.solicitanteId);
    if (!conexoes?.size) return;

    const mensagem = JSON.stringify(notificacao);
    for (const conexao of conexoes) {
      if (conexao.readyState !== WebSocket.OPEN) continue;
      try {
        conexao.send(mensagem, (erro) => {
          if (erro) console.error("[WEBSOCKET] Falha ao enviar notificacao:", erro);
        });
      } catch (erro) {
        console.error("[WEBSOCKET] Falha ao enviar notificacao:", erro);
      }
    }
  }

  fechar(): Promise<void> {
    this.fechando = true;
    this.removerObservador();
    this.servidorHttp.off("upgrade", this.aoAtualizarConexao);
    for (const conexao of this.servidorWebSocket.clients) conexao.terminate();

    return new Promise((resolve, reject) => {
      this.servidorWebSocket.close((erro) => {
        if (erro) {
          reject(erro);
          return;
        }
        resolve();
      });
    });
  }

  private readonly aoAtualizarConexao = (
    request: IncomingMessage,
    socket: Duplex,
    head: Buffer,
  ): void => {
    if (request.url?.split("?")[0] !== CAMINHO_NOTIFICACOES) {
      this.rejeitarConexao(socket, 404, "Not Found");
      return;
    }
    if (this.fechando) {
      this.rejeitarConexao(socket, 503, "Service Unavailable");
      return;
    }
    void this.autenticarEConectar(request, socket, head);
  };

  private async autenticarEConectar(request: IncomingMessage, socket: Duplex, head: Buffer): Promise<void> {
    try {
      const usuarioId = this.obterUsuarioIdDoToken(request);
      if (!usuarioId) {
        this.rejeitarConexao(socket, 401, "Unauthorized");
        return;
      }

      const usuario = await this.usuarios.buscarUsuarioParaAutenticacao(usuarioId);
      if (!usuario || !usuario.ativo) {
        this.rejeitarConexao(socket, 401, "Unauthorized");
        return;
      }
      if (this.fechando) {
        this.rejeitarConexao(socket, 503, "Service Unavailable");
        return;
      }

      this.servidorWebSocket.handleUpgrade(request, socket, head, (conexao) => {
        const conexoes = this.conexoesPorUsuario.get(usuario.id) ?? new Set<WebSocket>();
        conexoes.add(conexao);
        this.conexoesPorUsuario.set(usuario.id, conexoes);

        conexao.on("close", () => {
          conexoes.delete(conexao);
          if (conexoes.size === 0) this.conexoesPorUsuario.delete(usuario.id);
        });
        conexao.on("error", (erro) => {
          console.error(`[WEBSOCKET] Falha na conexao do usuario ${usuario.id}:`, erro);
        });
      });
    } catch (erro) {
      console.error("[WEBSOCKET] Falha ao autenticar conexao:", erro);
      this.rejeitarConexao(socket, 500, "Internal Server Error");
    }
  }

  private obterUsuarioIdDoToken(request: IncomingMessage): string | null {
    const token = request.headers.authorization?.match(/^Bearer\s+(.+)$/i)?.[1];
    if (!token) return null;

    try {
      const payload = jwt.verify(token, obterJwtSecret(), { algorithms: ["HS256"] });
      return typeof payload !== "string" && typeof payload.sub === "string" ? payload.sub : null;
    } catch (erro) {
      if (erro instanceof jwt.JsonWebTokenError) return null;
      throw erro;
    }
  }

  private rejeitarConexao(socket: Duplex, status: number, mensagem: string): void {
    if (socket.destroyed) return;
    socket.write(`HTTP/1.1 ${status} ${mensagem}\r\nConnection: close\r\n\r\n`);
    socket.destroy();
  }
}

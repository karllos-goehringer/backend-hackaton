import type { Router } from "express";
import { prisma } from "../../shared/config/database.js";
import { identificacaoProvisoria } from "../autenticacao/identificacao-provisoria.middleware.js";
import { NotificacoesService } from "../notificacoes/notificacoes.service.js";
import { UsuariosRepository } from "../usuarios/usuarios.repository.js";
import { CancelamentoController } from "./cancelamento.controller.js";
import { criarCancelamentoRouter } from "./cancelamento.routes.js";
import { CancelamentoService } from "./cancelamento.service.js";

/** Instancia singleton de notificacoes em memoria */
export const notificacoesService = new NotificacoesService();

export function criarModuloCancelamentos(): Router {
  const service = new CancelamentoService({
    prisma,
    notificacoes: notificacoesService,
  });

  return criarCancelamentoRouter(
    new CancelamentoController(service),
    identificacaoProvisoria(new UsuariosRepository(prisma)),
  );
}

import { Router, type RequestHandler } from "express";
import type { CancelamentoController } from "./cancelamento.controller.js";

export function criarCancelamentoRouter(controller: CancelamentoController, autenticar: RequestHandler): Router {
  const router = Router();

  router.use(autenticar);
  router.get("/solicitacoes", controller.listarSolicitacoes);
  router.post("/:id/cancelar", controller.cancelar);
  router.patch("/:id/cancelar", controller.cancelar);

  return router;
}

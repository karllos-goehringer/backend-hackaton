import { Router, type RequestHandler } from "express";
import type { ReservasController } from "./reservas.controller.js";

export function criarReservasRouter(controller: ReservasController, autenticar: RequestHandler): Router {
  const router = Router();

  router.use(autenticar);
  router.get("/", controller.listar);
  router.get("/:id", controller.buscarPorId);
  router.post("/", controller.criar);
  router.patch("/:id/aceitar-responsabilidade", controller.aceitarResponsabilidade);
  router.patch("/:id/aprovar", controller.aprovar);
  router.patch("/:id/rejeitar", controller.rejeitar);
  router.patch("/:id/cancelar", controller.cancelar);

  return router;
}

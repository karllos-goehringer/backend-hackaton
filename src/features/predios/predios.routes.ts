import { Router, type RequestHandler } from "express";
import type { PrediosController } from "./predios.controller.js";

export function criarPrediosRouter(
  controller: PrediosController,
  autenticar: RequestHandler,
): Router {
  const router = Router();

  router.get("/", controller.listar);
  router.get("/:id", controller.buscarPorId);
  router.get("/:id/salas", controller.listarSalasDoPredio);
  router.post("/seed", autenticar, controller.semear);
  router.post("/", autenticar, controller.criar);
  router.patch("/:id", autenticar, controller.atualizar);
  router.delete("/:id", autenticar, controller.remover);

  return router;
}


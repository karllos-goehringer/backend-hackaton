import { Router, type RequestHandler } from "express";
import type { SalasController } from "./salas.controller.js";

export function criarSalasRouter(controller: SalasController, autenticar: RequestHandler): Router {
  const router = Router();

  router.get("/", controller.listar);
  router.get("/:id", controller.buscarPorId);
  router.post("/", autenticar, controller.criar);
  router.patch("/:id", autenticar, controller.atualizar);
  router.delete("/:id", autenticar, controller.remover);

  return router;
}


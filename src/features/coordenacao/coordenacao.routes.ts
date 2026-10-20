import { Router, type RequestHandler } from "express";
import type { CoordenacaoController } from "./coordenacao.controller.js";

export function criarCoordenacaoRouter(controller: CoordenacaoController, autenticar: RequestHandler): Router {
  const router = Router();

  router.get("/", controller.listar);
  router.post("/", autenticar, controller.criar);
  router.post("/promover", autenticar, controller.promover);
  router.patch("/promover/:id", autenticar, controller.promover);
  router.get("/:id", controller.buscarPorId);
  router.patch("/:id", autenticar, controller.atualizar);
  router.put("/:id", autenticar, controller.substituir);
  router.delete("/:id", autenticar, controller.remover);

  return router;
}


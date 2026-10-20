import { Router } from "express";
import type { AutenticacaoController } from "./autenticacao.controller.js";

export function criarAutenticacaoRouter(controller: AutenticacaoController): Router {
  const router = Router();
  router.post("/", controller.autenticar);
  router.post("/login", controller.autenticar);
  return router;
}

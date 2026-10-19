import { Router } from "express";
import type { RequestHandler } from "express";
import type { UsuariosController } from "./usuarios.controller.js";

export function criarUsuariosRouter(controller: UsuariosController, autenticar: RequestHandler): Router {
  const router = Router();
  router.post("/", controller.cadastrar);
  router.post("/alunos", controller.cadastrar);
  router.post("/servidores", controller.cadastrar);
  router.get("/me", autenticar, controller.meuPerfil);
  return router;
}

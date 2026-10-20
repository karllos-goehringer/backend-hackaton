import { Router } from "express";
import type { RequestHandler } from "express";
import type { UsuariosController } from "./usuarios.controller.js";

export function criarUsuariosRouter(controller: UsuariosController, autenticar: RequestHandler): Router {
  const router = Router();
  router.post("/", controller.cadastrar);
  router.post("/alunos", controller.cadastrarAluno);
  router.post("/servidores", controller.cadastrarServidor);
  router.post("/professores", controller.cadastrarProfessor);
  router.post("/tecnicos", controller.cadastrarTecnico);
  router.post("/coordenadores", controller.cadastrarCoordenador);
  router.get("/servidores", controller.listarServidores);
  router.get("/professores", controller.listarProfessores);
  router.get("/tecnicos", controller.listarTecnicos);
  router.get("/coordenadores", controller.listarCoordenadores);
  router.get("/departamentos-elegiveis", controller.listarDepartamentosElegiveis);
  router.get("/me", autenticar, controller.meuPerfil);
  router.patch("/:id/promover-coordenador", autenticar, controller.promoverCoordenador);
  router.post("/:id/promover-coordenador", autenticar, controller.promoverCoordenador);
  return router;
}

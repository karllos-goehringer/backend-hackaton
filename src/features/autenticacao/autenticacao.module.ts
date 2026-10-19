import type { Router } from "express";
import { prisma } from "../../shared/config/database.js";
import { AutenticacaoController } from "./autenticacao.controller.js";
import { criarAutenticacaoRouter } from "./autenticacao.routes.js";
import { UsuariosService } from "../usuarios/usuarios.service.js";

export function criarModuloAutenticacao(): Router {
  return criarAutenticacaoRouter(new AutenticacaoController(new UsuariosService({ prisma })));
}

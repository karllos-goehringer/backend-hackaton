import type { Router } from "express";
import { prisma } from "../../shared/config/database.js";
import { autenticarToken } from "../autenticacao/autenticacao.middleware.js";
import { UsuariosController } from "./usuarios.controller.js";
import { UsuariosRepository } from "./usuarios.repository.js";
import { criarUsuariosRouter } from "./usuarios.routes.js";
import { UsuariosService } from "./usuarios.service.js";

export function criarModuloUsuarios(): Router {
  return criarUsuariosRouter(
    new UsuariosController(new UsuariosService({ prisma })),
    autenticarToken(new UsuariosRepository(prisma)),
  );
}

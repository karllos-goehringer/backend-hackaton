import type { Router } from "express";
import { prisma } from "../../shared/config/database.js";
import { autenticarToken } from "../autenticacao/autenticacao.middleware.js";
import { UsuariosRepository } from "../usuarios/usuarios.repository.js";
import { SalasController } from "./salas.controller.js";
import { criarSalasRouter } from "./salas.routes.js";
import { SalasService } from "./salas.service.js";

export function criarModuloSalas(): Router {
  const service = new SalasService({ prisma });
  return criarSalasRouter(
    new SalasController(service),
    autenticarToken(new UsuariosRepository(prisma)),
  );
}


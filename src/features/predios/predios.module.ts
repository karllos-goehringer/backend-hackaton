import type { Router } from "express";
import { prisma } from "../../shared/config/database.js";
import { autenticarToken } from "../autenticacao/autenticacao.middleware.js";
import { UsuariosRepository } from "../usuarios/usuarios.repository.js";
import { PrediosController } from "./predios.controller.js";
import { criarPrediosRouter } from "./predios.routes.js";
import { PrediosService } from "./predios.service.js";

export function criarModuloPredios(): Router {
  const service = new PrediosService({ prisma });
  return criarPrediosRouter(
    new PrediosController(service),
    autenticarToken(new UsuariosRepository(prisma)),
  );
}


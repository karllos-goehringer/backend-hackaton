import type { Router } from "express";
import { prisma } from "../../shared/config/database.js";
import { autenticarToken } from "../autenticacao/autenticacao.middleware.js";
import { UsuariosRepository } from "../usuarios/usuarios.repository.js";
import { CoordenacaoController } from "./coordenacao.controller.js";
import { criarCoordenacaoRouter } from "./coordenacao.routes.js";
import { CoordenacaoService } from "./coordenacao.service.js";

export function criarModuloCoordenacao(): Router {
  const service = new CoordenacaoService(prisma);
  return criarCoordenacaoRouter(
    new CoordenacaoController(service),
    autenticarToken(new UsuariosRepository(prisma)),
  );
}


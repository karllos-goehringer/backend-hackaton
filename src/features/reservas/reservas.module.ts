import type { Router } from "express";
import { prisma } from "../../shared/config/database.js";
import { identificacaoProvisoria } from "../autenticacao/identificacao-provisoria.middleware.js";
import { EscopoCoordenacaoService } from "../coordenacao/escopo-coordenacao.service.js";
import { LotacoesRepository } from "../coordenacao/lotacoes.repository.js";
import { UsuariosRepository } from "../usuarios/usuarios.repository.js";
import { ReservaFactory } from "./domain/fabrica/reserva.factory.js";
import { ResolvedorPoliticaReserva } from "./domain/politicas/resolvedor-politica.js";
import { criarPipelineValidacaoReserva } from "./domain/validadores/validadores-reserva.js";
import { carregarJanelaFuncionamento } from "./reservas.config.js";
import { ReservasController } from "./reservas.controller.js";
import { criarReservasRouter } from "./reservas.routes.js";
import { ReservasService } from "./reservas.service.js";

/** Composition root da feature: monta as dependencias concretas (injecao manual, sem container). */
export function criarModuloReservas(): Router {
  const escopo = new EscopoCoordenacaoService(new LotacoesRepository(prisma));
  const service = new ReservasService({
    prisma,
    resolvedor: new ResolvedorPoliticaReserva(escopo),
    pipeline: criarPipelineValidacaoReserva(carregarJanelaFuncionamento()),
    factory: new ReservaFactory(),
  });

  return criarReservasRouter(
    new ReservasController(service),
    identificacaoProvisoria(new UsuariosRepository(prisma)),
  );
}


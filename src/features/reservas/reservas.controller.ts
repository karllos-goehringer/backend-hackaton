import type { Request, Response } from "express";
import { obterAtor } from "../autenticacao/autenticacao.middleware.js";
import type { ReservasService } from "./reservas.service.js";
import {
  validarCriacaoReserva,
  validarIdReserva,
  validarJustificativaCancelamento,
  validarMotivoRejeicao,
} from "./reservas.validation.js";

/** Adaptador HTTP: extrai/valida entrada, delega ao service e formata a resposta. */
export class ReservasController {
  constructor(private readonly service: ReservasService) {}

  criar = async (request: Request, response: Response): Promise<void> => {
    const comando = validarCriacaoReserva(request.body);
    const resultado = await this.service.criar(obterAtor(request), comando);
    response.status(201).json(resultado);
  };

  aprovar = async (request: Request, response: Response): Promise<void> => {
    const id = validarIdReserva(request.params.id);
    response.json(await this.service.aprovar(obterAtor(request), id));
  };

  rejeitar = async (request: Request, response: Response): Promise<void> => {
    const id = validarIdReserva(request.params.id);
    const motivo = validarMotivoRejeicao(request.body);
    response.json(await this.service.rejeitar(obterAtor(request), id, motivo));
  };

  cancelar = async (request: Request, response: Response): Promise<void> => {
    const id = validarIdReserva(request.params.id);
    const justificativa = validarJustificativaCancelamento(request.body);
    response.json(await this.service.cancelar(obterAtor(request), id, justificativa));
  };
}


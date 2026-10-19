import type { Request, Response } from "express";
import { obterAtor } from "../autenticacao/identificacao-provisoria.middleware.js";
import type { ReservasService } from "./reservas.service.js";
import {
  validarCriacaoReserva,
  validarFiltrosListagem,
  validarIdReserva,
  validarJustificativaCancelamento,
  validarMotivoRejeicao,
} from "./reservas.validation.js";

/** Adaptador HTTP: extrai/valida entrada, delega ao service e formata a resposta. */
export class ReservasController {
  constructor(private readonly service: ReservasService) {}

  listar = async (request: Request, response: Response): Promise<void> => {
    const filtros = validarFiltrosListagem(request.query);
    response.status(200).json(await this.service.listar(filtros));
  };

  buscarPorId = async (request: Request, response: Response): Promise<void> => {
    const id = validarIdReserva(request.params.id);
    response.status(200).json(await this.service.buscarPorId(id));
  };

  criar = async (request: Request, response: Response): Promise<void> => {
    const comando = validarCriacaoReserva(request.body);
    const resultado = await this.service.criar(obterAtor(request), comando);
    response.status(201).json(resultado);
  };

  aceitarResponsabilidade = async (request: Request, response: Response): Promise<void> => {
    const id = validarIdReserva(request.params.id);
    response.status(200).json(await this.service.aceitarResponsabilidade(obterAtor(request), id));
  };

  aprovar = async (request: Request, response: Response): Promise<void> => {
    const id = validarIdReserva(request.params.id);
    response.status(200).json(await this.service.aprovar(obterAtor(request), id));
  };

  rejeitar = async (request: Request, response: Response): Promise<void> => {
    const id = validarIdReserva(request.params.id);
    const motivo = validarMotivoRejeicao(request.body);
    response.status(200).json(await this.service.rejeitar(obterAtor(request), id, motivo));
  };

  cancelar = async (request: Request, response: Response): Promise<void> => {
    const id = validarIdReserva(request.params.id);
    const justificativa = validarJustificativaCancelamento(request.body);
    const resultado = await this.service.cancelar(obterAtor(request), id, justificativa);

    if (resultado.solicitacaoEnviada) {
      response.status(202).json(resultado);
      return;
    }

    response.status(200).json(resultado);
  };
}

import type { Request, Response } from "express";
import { obterAtor } from "../autenticacao/autenticacao.middleware.js";
import type { SalasService } from "./salas.service.js";
import {
  validarAtualizacaoSala,
  validarCriacaoSala,
  validarFiltrosSalas,
  validarIdSala,
} from "./salas.validation.js";

export class SalasController {
  constructor(private readonly service: SalasService) {}

  listar = async (request: Request, response: Response) => {
    const filtros = validarFiltrosSalas(request.query);
    const salas = await this.service.listar(filtros);
    response.status(200).json(salas);
  };

  buscarPorId = async (request: Request, response: Response) => {
    const id = validarIdSala(request.params.id);
    const sala = await this.service.buscarPorId(id);
    response.status(200).json(sala);
  };

  criar = async (request: Request, response: Response) => {
    const ator = obterAtor(request);
    const dados = validarCriacaoSala(request.body);
    const sala = await this.service.criar(ator, dados);
    response.status(201).json(sala);
  };

  atualizar = async (request: Request, response: Response) => {
    const ator = obterAtor(request);
    const id = validarIdSala(request.params.id);
    const dados = validarAtualizacaoSala(request.body);
    const sala = await this.service.atualizar(ator, id, dados);
    response.status(200).json(sala);
  };

  remover = async (request: Request, response: Response) => {
    const ator = obterAtor(request);
    const id = validarIdSala(request.params.id);
    await this.service.remover(ator, id);
    response.status(204).send();
  };
}


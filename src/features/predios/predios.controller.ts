import type { Request, Response } from "express";
import { obterAtor } from "../autenticacao/autenticacao.middleware.js";
import { validarFiltrosSalas } from "../salas/salas.validation.js";
import type { PrediosService } from "./predios.service.js";
import {
  validarAtualizacaoPredio,
  validarCriacaoPredio,
  validarFiltrosPredios,
  validarIdPredio,
} from "./predios.validation.js";

export class PrediosController {
  constructor(private readonly service: PrediosService) {}

  listar = async (request: Request, response: Response) => {
    const filtros = validarFiltrosPredios(request.query);
    const predios = await this.service.listar(filtros);
    response.status(200).json(predios);
  };

  buscarPorId = async (request: Request, response: Response) => {
    const id = validarIdPredio(request.params.id);
    const filtros = validarFiltrosPredios(request.query);
    const predio = await this.service.buscarPorId(id, {
      ...(filtros.incluirInativas !== undefined
        ? { incluirInativas: filtros.incluirInativas }
        : {}),
    });
    response.status(200).json(predio);
  };

  listarSalasDoPredio = async (request: Request, response: Response) => {
    const predioId = validarIdPredio(request.params.id);
    const filtros = validarFiltrosSalas(request.query);
    const salas = await this.service.listarSalasDoPredio(predioId, filtros);
    response.status(200).json(salas);
  };

  criar = async (request: Request, response: Response) => {
    const ator = obterAtor(request);
    const dados = validarCriacaoPredio(request.body);
    const predio = await this.service.criar(ator, dados);
    response.status(201).json(predio);
  };

  atualizar = async (request: Request, response: Response) => {
    const ator = obterAtor(request);
    const id = validarIdPredio(request.params.id);
    const dados = validarAtualizacaoPredio(request.body);
    const predio = await this.service.atualizar(ator, id, dados);
    response.status(200).json(predio);
  };

  remover = async (request: Request, response: Response) => {
    const ator = obterAtor(request);
    const id = validarIdPredio(request.params.id);
    await this.service.remover(ator, id);
    response.status(204).send();
  };

  semear = async (request: Request, response: Response) => {
    const resultado = await this.service.semearDadosIniciais();
    response.status(200).json(resultado);
  };
}


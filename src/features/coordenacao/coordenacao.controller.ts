import type { Request, Response } from "express";
import { obterAtor } from "../autenticacao/autenticacao.middleware.js";
import type { CoordenacaoService } from "./coordenacao.service.js";
import {
  validarAtualizarCoordenacao,
  validarCriarCoordenacao,
  validarFiltrosCoordenacao,
  validarPromoverCoordenador,
} from "./coordenacao.validation.js";

function obterIdParam(param: string | string[] | undefined): string {
  if (Array.isArray(param)) return param[0] ?? "";
  return typeof param === "string" ? param : "";
}

export class CoordenacaoController {
  constructor(private readonly service: CoordenacaoService) {}

  listar = async (request: Request, response: Response): Promise<void> => {
    const filtros = validarFiltrosCoordenacao(request.query);
    const resultado = await this.service.listar(filtros);
    response.status(200).json(resultado);
  };

  buscarPorId = async (request: Request, response: Response): Promise<void> => {
    const id = obterIdParam(request.params.id);
    const resultado = await this.service.buscarPorId(id);
    response.status(200).json(resultado);
  };

  criar = async (request: Request, response: Response): Promise<void> => {
    const ator = obterAtor(request);
    const dados = validarCriarCoordenacao(request.body);
    const resultado = await this.service.criar(ator, dados);
    response.status(201).json(resultado);
  };

  atualizar = async (request: Request, response: Response): Promise<void> => {
    const ator = obterAtor(request);
    const id = obterIdParam(request.params.id);
    const dados = validarAtualizarCoordenacao(request.body);
    const resultado = await this.service.atualizar(ator, id, dados);
    response.status(200).json(resultado);
  };

  substituir = async (request: Request, response: Response): Promise<void> => {
    const ator = obterAtor(request);
    const id = obterIdParam(request.params.id);
    const dados = validarCriarCoordenacao(request.body);
    const resultado = await this.service.atualizar(ator, id, dados);
    response.status(200).json(resultado);
  };

  remover = async (request: Request, response: Response): Promise<void> => {
    const ator = obterAtor(request);
    const id = obterIdParam(request.params.id);
    await this.service.remover(ator, id);
    response.status(204).send();
  };

  promover = async (request: Request, response: Response): Promise<void> => {
    const ator = obterAtor(request);
    const usuarioId = typeof request.body?.usuarioId === "string" ? request.body.usuarioId : obterIdParam(request.params.id);
    const dados = validarPromoverCoordenador(request.body);
    const resultado = await this.service.promover(ator, usuarioId, dados);
    response.status(200).json(resultado);
  };
}


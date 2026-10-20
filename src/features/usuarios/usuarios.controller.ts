import type { Request, Response } from "express";
import { obterAtor } from "../autenticacao/autenticacao.middleware.js";
import type { CadastroUsuarioDTO } from "./cadastro-usuario.dto.js";
import type { UsuariosService } from "./usuarios.service.js";

export class UsuariosController {
  constructor(private readonly service: UsuariosService) {}

  cadastrar = async (request: Request, response: Response): Promise<void> => {
    const resultado = await this.service.cadastrar(
      request.body as CadastroUsuarioDTO,
    );
    response.status(201).json(resultado);
  };

  cadastrarAluno = async (request: Request, response: Response): Promise<void> => {
    const resultado = await this.service.cadastrar(
      request.body as CadastroUsuarioDTO,
      { papelRota: "ALUNO" },
    );
    response.status(201).json(resultado);
  };

  cadastrarServidor = async (request: Request, response: Response): Promise<void> => {
    const resultado = await this.service.cadastrar(
      request.body as CadastroUsuarioDTO,
      { exigirServidor: true },
    );
    response.status(201).json(resultado);
  };

  cadastrarProfessor = async (request: Request, response: Response): Promise<void> => {
    const resultado = await this.service.cadastrar(
      request.body as CadastroUsuarioDTO,
      { papelRota: "PROFESSOR" },
    );
    response.status(201).json(resultado);
  };

  cadastrarTecnico = async (request: Request, response: Response): Promise<void> => {
    const resultado = await this.service.cadastrar(
      request.body as CadastroUsuarioDTO,
      { papelRota: "TECNICO" },
    );
    response.status(201).json(resultado);
  };

  cadastrarCoordenador = async (request: Request, response: Response): Promise<void> => {
    const resultado = await this.service.cadastrar(
      request.body as CadastroUsuarioDTO,
      { papelRota: "COORDENADOR" },
    );
    response.status(201).json(resultado);
  };

  meuPerfil = async (request: Request, response: Response): Promise<void> => {
    const ator = obterAtor(request);
    response.json(await this.service.buscarMeuPerfil(ator.id));
  };

  listarDepartamentosElegiveis = async (_request: Request, response: Response): Promise<void> => {
    response.json(await this.service.listarDepartamentosElegiveis());
  };

  listarServidores = async (request: Request, response: Response): Promise<void> => {
    const role = typeof request.query.role === "string" ? request.query.role : typeof request.query.papel === "string" ? request.query.papel : undefined;
    const departamentoId = typeof request.query.departamentoId === "string" ? request.query.departamentoId : undefined;
    const predioId = typeof request.query.predioId === "string" ? request.query.predioId : undefined;
    const servidores = await this.service.listarServidores({ role, departamentoId, predioId });
    response.status(200).json(servidores);
  };

  listarProfessores = async (request: Request, response: Response): Promise<void> => {
    const departamentoId = typeof request.query.departamentoId === "string" ? request.query.departamentoId : undefined;
    const servidores = await this.service.listarServidores({ role: "PROFESSOR", departamentoId });
    response.status(200).json(servidores);
  };

  listarTecnicos = async (request: Request, response: Response): Promise<void> => {
    const departamentoId = typeof request.query.departamentoId === "string" ? request.query.departamentoId : undefined;
    const servidores = await this.service.listarServidores({ role: "TECNICO", departamentoId });
    response.status(200).json(servidores);
  };

  listarCoordenadores = async (request: Request, response: Response): Promise<void> => {
    const predioId = typeof request.query.predioId === "string" ? request.query.predioId : undefined;
    const departamentoId = typeof request.query.departamentoId === "string" ? request.query.departamentoId : undefined;
    const servidores = await this.service.listarServidores({ role: "COORDENADOR", predioId, departamentoId });
    response.status(200).json(servidores);
  };
}

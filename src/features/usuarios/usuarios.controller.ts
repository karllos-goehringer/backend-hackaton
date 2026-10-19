import type { Request, Response } from "express";
import { obterAtor } from "../autenticacao/autenticacao.middleware.js";
import type { CadastroUsuarioDTO } from "./cadastro-usuario.dto.js";
import type { UsuariosService } from "./usuarios.service.js";

export class UsuariosController {
  constructor(private readonly service: UsuariosService) {}

  cadastrar = async (request: Request, response: Response): Promise<void> => {
    const chaveProvisionamento = request.header("x-provision-key");
    const resultado = await this.service.cadastrar(request.body as CadastroUsuarioDTO, chaveProvisionamento);
    response.status(201).json(resultado);
  };

  meuPerfil = async (request: Request, response: Response): Promise<void> => {
    const ator = obterAtor(request);
    response.json(await this.service.buscarMeuPerfil(ator.id));
  };
}

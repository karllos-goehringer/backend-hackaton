import type { Request, Response } from "express";
import type { AutenticarCredencialDTO } from "../usuarios/credencial.dto.js";
import type { UsuariosService } from "../usuarios/usuarios.service.js";

export class AutenticacaoController {
  constructor(private readonly usuarios: UsuariosService) {}

  autenticar = async (request: Request, response: Response): Promise<void> => {
    response.json(await this.usuarios.autenticar(request.body as AutenticarCredencialDTO));
  };
}

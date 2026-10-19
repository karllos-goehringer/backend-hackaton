import type { Request, RequestHandler } from "express";
import type { TipoCredencial } from "@prisma/client";
import { UnauthorizedError } from "../../shared/errors/app-error.js";
import { ehObjectId } from "../../shared/validation/object-id.js";
import type { UsuariosRepository } from "../usuarios/usuarios.repository.js";

/** Usuario identificado na requisicao. O papel (Aluno/Professor/Coordenador) e resolvido por operacao. */
export interface AtorAutenticado {
  id: string;
  nome: string;
  tipoCredencial: TipoCredencial;
}

declare global {
  namespace Express {
    interface Request {
      ator?: AtorAutenticado;
    }
  }
}

export const CABECALHO_USUARIO = "x-usuario-id";

/**
 * IDENTIFICACAO PROVISORIA — NAO USAR EM PRODUCAO.
 * Le o id do usuario do cabecalho `x-usuario-id` e o carrega do banco. Existe apenas porque a
 * autenticacao (JWT + Argon2id, secao 5.2 do documento de arquitetura) ainda nao foi implementada.
 * Substitua este middleware pelo de validacao do JWT mantendo o contrato `request.ator`.
 */
export function identificacaoProvisoria(usuarios: UsuariosRepository): RequestHandler {
  return async (request, _response, next) => {
    const id = request.header(CABECALHO_USUARIO);
    if (!ehObjectId(id)) {
      throw new UnauthorizedError(`Informe o cabecalho ${CABECALHO_USUARIO} com um id de usuario valido.`);
    }

    const usuario = await usuarios.buscarResumoPorId(id);
    if (!usuario || !usuario.ativo) {
      throw new UnauthorizedError("Usuario inexistente ou inativo.");
    }

    request.ator = { id: usuario.id, nome: usuario.nome, tipoCredencial: usuario.tipoCredencial };
    next();
  };
}

export function obterAtor(request: Request): AtorAutenticado {
  if (!request.ator) throw new UnauthorizedError();
  return request.ator;
}

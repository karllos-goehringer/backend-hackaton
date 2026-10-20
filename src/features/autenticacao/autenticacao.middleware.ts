import type { Request, RequestHandler } from "express";
import jwt from "jsonwebtoken";
import { TipoCredencial } from "@prisma/client";
import { UnauthorizedError } from "../../shared/errors/app-error.js";
import { UsuariosRepository } from "../usuarios/usuarios.repository.js";
import { NivelAcesso } from "../usuarios/nivel-acesso.js";
import { obterJwtSecret } from "../usuarios/usuarios.service.js";

export interface AtorAutenticado {
  id: string;
  nome: string;
  tipoCredencial: TipoCredencial;
  nivelAcesso: NivelAcesso;
  departamentoId: string | null;
}

declare global {
  namespace Express {
    interface Request {
      ator?: AtorAutenticado;
    }
  }
}

export function autenticarToken(usuarios: UsuariosRepository): RequestHandler {
  return async (request, _response, next) => {
    const authorization = request.header("authorization");
    const token = authorization?.match(/^Bearer\s+(.+)$/i)?.[1];
    if (!token) throw new UnauthorizedError("Informe um token Bearer valido.");

    let payload: jwt.JwtPayload;
    try {
      const decoded = jwt.verify(token, obterJwtSecret(), { algorithms: ["HS256"] });
      if (typeof decoded === "string" || typeof decoded.sub !== "string") {
        throw new UnauthorizedError("Token invalido.");
      }
      payload = decoded;
    } catch {
      throw new UnauthorizedError("Token invalido ou expirado.");
    }

    const subject = payload.sub;
    if (!subject) throw new UnauthorizedError("Token invalido.");
    const usuario = await usuarios.buscarUsuarioParaAutenticacao(subject);
    if (!usuario || !usuario.ativo) throw new UnauthorizedError("Usuario inexistente ou inativo.");

    let nivelAcesso = usuario.tipoCredencial === TipoCredencial.MATRICULA_ALUNO
      ? NivelAcesso.ALUNO
      : usuario.tipoCredencial === TipoCredencial.SIAPE_TECNICO
        ? NivelAcesso.TECNICO
        : NivelAcesso.PROFESSOR;
    if (
      usuario.nivelAcesso === NivelAcesso.COORDENADOR ||
      (usuario.tipoCredencial === TipoCredencial.SIAPE_DOCENTE &&
        await usuarios.possuiLotacaoAtiva(usuario.id))
    ) {
      nivelAcesso = NivelAcesso.COORDENADOR;
    }

    request.ator = {
      id: usuario.id,
      nome: usuario.nome,
      tipoCredencial: usuario.tipoCredencial,
      nivelAcesso,
      departamentoId: usuario.departamentoId ?? null,
    };
    next();
  };
}

export function obterAtor(request: Request): AtorAutenticado {
  if (!request.ator) throw new UnauthorizedError();
  return request.ator;
}

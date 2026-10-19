import type { ErrorRequestHandler } from "express";
import { Prisma } from "@prisma/client";
import { AppError } from "../errors/app-error.js";

/**
 * Error handler central. Express 5 encaminha automaticamente rejeicoes de handlers async para ca.
 */
export const errorHandler: ErrorRequestHandler = (error, _request, response, _next) => {
  if (error instanceof AppError) {
    response.status(error.statusCode).json({
      erro: error.codigo,
      mensagem: error.message,
      ...(error.detalhes !== undefined ? { detalhes: error.detalhes } : {}),
    });
    return;
  }

  // JSON malformado no corpo (express.json / body-parser).
  if (isBodyParserError(error)) {
    response.status(400).json({ erro: "VALIDACAO", mensagem: "Corpo da requisicao nao e um JSON valido." });
    return;
  }

  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    const mapeado = mapearErroPrisma(error);
    if (mapeado) {
      response.status(mapeado.status).json({ erro: mapeado.codigo, mensagem: mapeado.mensagem });
      return;
    }
  }

  console.error("Erro nao tratado:", error);
  response.status(500).json({ erro: "ERRO_INTERNO", mensagem: "Erro interno do servidor." });
};

function isBodyParserError(error: unknown): boolean {
  return typeof error === "object" && error !== null && (error as { type?: unknown }).type === "entity.parse.failed";
}

function mapearErroPrisma(
  error: Prisma.PrismaClientKnownRequestError,
): { status: number; codigo: string; mensagem: string } | null {
  switch (error.code) {
    case "P2002":
      return { status: 409, codigo: "CONFLITO", mensagem: "Registro duplicado para um campo unico." };
    case "P2014":
    case "P2003":
      return { status: 409, codigo: "CONFLITO", mensagem: "Operacao viola a integridade referencial." };
    case "P2025":
      return { status: 404, codigo: "NAO_ENCONTRADO", mensagem: "Registro nao encontrado." };
    case "P2034":
      return {
        status: 409,
        codigo: "CONFLITO",
        mensagem: "Operacao concorrente detectada. Tente novamente.",
      };
    default:
      return null;
  }
}


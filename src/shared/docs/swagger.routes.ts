import { Router, type Request, type Response } from "express";
import swaggerUi from "swagger-ui-express";
import { construirEspecificacaoOpenApi } from "./openapi.spec.js";

export function swaggerEstaHabilitado(env: NodeJS.ProcessEnv = process.env): boolean {
  const flag = env.SWAGGER_ENABLED?.trim().toLowerCase();
  if (flag === "false" || flag === "0") return false;
  if (flag === "true" || flag === "1") return true;
  return true;
}

export function criarModuloSwagger(): Router {
  const router = Router();

  if (!swaggerEstaHabilitado()) {
    return router;
  }

  const servirEspecificacaoJson = (request: Request, response: Response): void => {
    const protocolo = request.protocol || "http";
    const host = request.get("host");
    const baseUrl = host ? `${protocolo}://${host}` : undefined;
    const spec = construirEspecificacaoOpenApi(baseUrl ? { baseUrl } : {});
    response.setHeader("Content-Type", "application/json; charset=utf-8");
    response.status(200).json(spec);
  };

  router.get("/api-docs.json", servirEspecificacaoJson);
  router.get("/openapi.json", servirEspecificacaoJson);

  router.use(
    "/api-docs",
    swaggerUi.serve,
    swaggerUi.setup(undefined, {
      customSiteTitle: "ReservaIF — Documentação da API (Swagger)",
      explorer: true,
      swaggerOptions: {
        url: "/api-docs.json",
        persistAuthorization: true,
        displayRequestDuration: true,
        docExpansion: "list",
        filter: true,
      },
    }),
  );

  return router;
}

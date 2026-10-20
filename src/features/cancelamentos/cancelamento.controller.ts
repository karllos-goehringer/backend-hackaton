import type { Request, Response } from "express";
import { obterAtor } from "../autenticacao/autenticacao.middleware.js";
import { validarIdReserva, validarJustificativaCancelamento } from "../reservas/reservas.validation.js";
import type { CancelamentoService } from "./cancelamento.service.js";

/** Adaptador HTTP para cancelamentos e substituicoes de reservas. */
export class CancelamentoController {
  constructor(private readonly service: CancelamentoService) {}

  listarSolicitacoes = async (_request: Request, response: Response): Promise<void> => {
    response.status(200).json(this.service.listarSolicitacoesPendentes());
  };

  solicitarCancelamentoProfessor = async (request: Request, response: Response): Promise<void> => {
    const id = validarIdReserva(request.params.id);
    const justificativa = validarJustificativaCancelamento(request.body);
    const finalidade =
      typeof request.body?.finalidade === "string" && request.body.finalidade.trim().length > 0
        ? request.body.finalidade.trim()
        : undefined;
    const resultado = await this.service.solicitarCancelamentoProfessor(
      obterAtor(request),
      id,
      justificativa,
      finalidade,
    );
    response.status(202).json(resultado);
  };

  aprovarSolicitacao = async (request: Request, response: Response): Promise<void> => {
    const id = validarIdReserva(request.params.id);
    const resultado = await this.service.aprovarSolicitacaoCancelamento(obterAtor(request), id);
    response.status(200).json(resultado);
  };

  rejeitarSolicitacao = async (request: Request, response: Response): Promise<void> => {
    const id = validarIdReserva(request.params.id);
    const motivo =
      typeof request.body?.motivo === "string" && request.body.motivo.trim().length > 0
        ? request.body.motivo.trim()
        : typeof request.body?.justificativa === "string" && request.body.justificativa.trim().length > 0
          ? request.body.justificativa.trim()
          : undefined;
    const resultado = await this.service.rejeitarSolicitacaoCancelamento(obterAtor(request), id, motivo);
    response.status(200).json(resultado);
  };

  cancelar = async (request: Request, response: Response): Promise<void> => {
    const id = validarIdReserva(request.params.id);
    const justificativa = validarJustificativaCancelamento(request.body);
    const resultado = await this.service.cancelar(obterAtor(request), id, justificativa);

    if (resultado.solicitacaoEnviada) {
      response.status(202).json(resultado);
      return;
    }

    response.status(200).json(resultado);
  };
}

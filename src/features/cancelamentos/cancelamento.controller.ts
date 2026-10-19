import type { Request, Response } from "express";
import { obterAtor } from "../autenticacao/identificacao-provisoria.middleware.js";
import { validarIdReserva, validarJustificativaCancelamento } from "../reservas/reservas.validation.js";
import type { CancelamentoService } from "./cancelamento.service.js";

/** Adaptador HTTP para cancelamentos de reservas. */
export class CancelamentoController {
  constructor(private readonly service: CancelamentoService) {}

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

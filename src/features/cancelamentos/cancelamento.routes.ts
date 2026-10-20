import { Router, type RequestHandler } from "express";
import type { CancelamentoController } from "./cancelamento.controller.js";

export function criarCancelamentoRouter(controller: CancelamentoController, autenticar: RequestHandler): Router {
  const router = Router();

  router.use(autenticar);
  router.get("/solicitacoes", controller.listarSolicitacoes);

  // Endpoint exclusivo para professor solicitar cancelamento/substituicao de reserva de aluno ao coordenador
  router.post("/:id/solicitar", controller.solicitarCancelamentoProfessor);
  router.post("/:id/solicitar-professor", controller.solicitarCancelamentoProfessor);
  router.patch("/:id/solicitar", controller.solicitarCancelamentoProfessor);

  // Endpoints para o coordenador aprovar ou rejeitar o pedido de cancelamento/substituicao do professor
  router.post("/solicitacoes/:id/aprovar", controller.aprovarSolicitacao);
  router.patch("/solicitacoes/:id/aprovar", controller.aprovarSolicitacao);
  router.post("/:id/aprovar", controller.aprovarSolicitacao);
  router.patch("/:id/aprovar", controller.aprovarSolicitacao);

  router.post("/solicitacoes/:id/rejeitar", controller.rejeitarSolicitacao);
  router.patch("/solicitacoes/:id/rejeitar", controller.rejeitarSolicitacao);
  router.post("/:id/rejeitar", controller.rejeitarSolicitacao);
  router.patch("/:id/rejeitar", controller.rejeitarSolicitacao);

  // Cancelamento direto (propria reserva para aluno/tecnico/professor; qualquer reserva de aluno/tecnico/professor para coordenador)
  router.post("/:id/cancelar", controller.cancelar);
  router.patch("/:id/cancelar", controller.cancelar);

  return router;
}

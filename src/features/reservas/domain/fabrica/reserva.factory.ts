import { StatusReserva, type Prisma } from "@prisma/client";
import { dataCivil } from "../../../../shared/utils/data-hora.js";
import type { NovaReservaCommand, Ocorrencia, RegraRecorrencia } from "../reserva.types.js";
import { GeradorRecorrencia } from "./gerador-recorrencia.js";

export interface ParametrosCriacaoReservas {
  comando: NovaReservaCommand;
  solicitanteId: string;
  responsavelId: string;
  status: StatusReserva;
  ocorrencias: Ocorrencia[];
  serieRecorrenciaId?: string;
  agora: Date;
}

/**
 * Factory Method: centraliza a construcao de reservas unicas ou de series recorrentes,
 * para que todas as alocacoes nascam consistentes (mesma finalidade, responsavel e status).
 */
export class ReservaFactory {
  constructor(private readonly gerador = new GeradorRecorrencia()) {}

  gerarOcorrencias(comando: NovaReservaCommand): Ocorrencia[] {
    const primeira: Ocorrencia = { inicio: comando.dataHoraInicio, fim: comando.dataHoraFim };
    return comando.recorrencia ? this.gerador.gerar(primeira, comando.recorrencia) : [primeira];
  }

  criarSerie(
    comando: NovaReservaCommand & { recorrencia: RegraRecorrencia },
    coordenadorId: string,
  ): Prisma.SerieRecorrenciaUncheckedCreateInput {
    return {
      criadoPorId: coordenadorId,
      tipoRecorrencia: comando.recorrencia.tipo,
      dataInicio: dataCivil(comando.dataHoraInicio),
      dataFim: comando.recorrencia.dataFim,
      diasSemana: comando.recorrencia.diasSemana,
    };
  }

  criarReservas(params: ParametrosCriacaoReservas): Prisma.ReservaCreateManyInput[] {
    // Reserva criada ja aprovada (coordenador no proprio escopo) registra o proprio coordenador como analisador.
    const autoAprovada = params.status === StatusReserva.APROVADA;
    return params.ocorrencias.map((ocorrencia) => ({
      salaId: params.comando.salaId,
      solicitanteId: params.solicitanteId,
      responsavelId: params.responsavelId,
      serieRecorrenciaId: params.serieRecorrenciaId,
      dataHoraInicio: ocorrencia.inicio,
      dataHoraFim: ocorrencia.fim,
      finalidade: params.comando.finalidade,
      observacoes: params.comando.observacoes,
      status: params.status,
      criadoEm: params.agora,
      ...(autoAprovada ? { analisadoPorId: params.solicitanteId, analisadoEm: params.agora } : {}),
    }));
  }
}


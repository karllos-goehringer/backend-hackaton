import { StatusReserva, TipoRecorrencia, type Prisma } from "@prisma/client";
import { dataCivil } from "../../../../shared/utils/data-hora.js";
import type { NovaReservaCommand, Ocorrencia, RegraRecorrencia } from "../reserva.types.js";
import {
  GeradorRecorrencia,
  resolverDataFimRecorrencia,
  resolverDiasSemanaRecorrencia,
} from "./gerador-recorrencia.js";

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
    const dataInicio = dataCivil(comando.dataHoraInicio);
    return {
      criadoPorId: coordenadorId,
      tipoRecorrencia: comando.recorrencia.tipo,
      dataInicio,
      dataFim: resolverDataFimRecorrencia(dataInicio, comando.recorrencia),
      diasSemana: resolverDiasSemanaRecorrencia(comando.dataHoraInicio, comando.recorrencia),
    };
  }

  criarReservas(params: ParametrosCriacaoReservas): Prisma.ReservaCreateManyInput[] {
    const autoAprovada = params.status === StatusReserva.APROVADA;
    return params.ocorrencias.map((ocorrencia) => ({
      salaId: params.comando.salaId,
      solicitanteId: params.solicitanteId,
      responsavelId: params.responsavelId,
      serieRecorrenciaId: params.serieRecorrenciaId,
      tipoRecorrencia: params.comando.recorrencia?.tipo ?? TipoRecorrencia.UNICA,
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

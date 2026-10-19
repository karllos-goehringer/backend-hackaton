import type { TipoCredencial } from "@prisma/client";
import type { DbClient } from "../../shared/database/transacao.js";

export interface UsuarioResumo {
  id: string;
  nome: string;
  tipoCredencial: TipoCredencial;
  ativo: boolean;
}

export class UsuariosRepository {
  constructor(private readonly db: DbClient) {}

  buscarResumoPorId(id: string): Promise<UsuarioResumo | null> {
    return this.db.usuario.findUnique({
      where: { id },
      select: { id: true, nome: true, tipoCredencial: true, ativo: true },
    });
  }

  /**
   * Escreve no documento do usuario para serializar transacoes concorrentes do mesmo solicitante
   * (gera write conflict entre elas). Usado na quota de 12 horas do aluno.
   */
  async travarSolicitacoes(id: string): Promise<void> {
    await this.db.usuario.update({
      where: { id },
      data: { versaoSolicitacoes: { increment: 1 } },
      select: { id: true },
    });
  }
}


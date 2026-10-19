import type { TipoCredencial } from "@prisma/client";
import type { CriarCredencialDTO } from "./credencial.dto.js";

export interface CadastroUsuarioDTO {
  uuid?: string;
  nome: string;
  email: string;
  telefone?: string;
  tipoCredencial: TipoCredencial;
  credencial: CriarCredencialDTO;
  cursoId?: string;
  departamentoId?: string;
}

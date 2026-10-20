import type { TipoCredencial } from "@prisma/client";
import type { CriarCredencialDTO, TipoEntrada } from "./credencial.dto.js";
import type { NivelAcesso } from "./nivel-acesso.js";

export type PapelCadastroUsuario = "ALUNO" | "PROFESSOR" | "TECNICO" | "COORDENADOR";

export interface LotacaoCoordenacaoCadastroInput {
  predioId: string;
  numeroPortaria?: string;
}

export interface CadastroUsuarioDTO {
  uuid?: string;
  nome: string;
  email?: string | null;
  telefone?: string | null;
  tipoCredencial?: TipoCredencial;
  nivelAcesso?: NivelAcesso | PapelCadastroUsuario;
  perfil?: PapelCadastroUsuario;
  role?: PapelCadastroUsuario;
  matricula?: string | number;
  siape?: string | number;
  senha?: string | number;
  tipoEntrada?: TipoEntrada;
  credencial?: CriarCredencialDTO;
  departamentoId?: string | null;
  predioId?: string;
  predioIds?: string[];
  numeroPortaria?: string;
  coordenacoes?: LotacaoCoordenacaoCadastroInput[];
}

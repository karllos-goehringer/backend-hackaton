/** Valores de entrada da API: 0=local, 1=corporativa, 2=OAuth. */
export enum TipoEntrada {
  LOCAL = 0,
  CORPORATIVA = 1,
  OAUTH = 2,
}

export interface CriarCredencialDTO {
  tipoEntrada?: TipoEntrada;
  entrada?: string | number;
  senha: string | number;
}

export interface AutenticarCredencialDTO {
  tipoEntrada?: TipoEntrada;
  entrada: string | number;
  senha: string | number;
}

export interface CredencialAutenticadaDTO {
  uuid: string;
  nivelAcesso: number;
  token: string;
}

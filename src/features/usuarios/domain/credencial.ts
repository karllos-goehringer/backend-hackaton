import type { TipoEntradaCredencial } from "@prisma/client";

export interface CredencialProps {
  id?: string;
  usuarioId: string;
  tipoEntrada: TipoEntradaCredencial;
  entrada: string | number;
  senhaHash: string;
}

/** Credencial persistida: contém apenas o hash, nunca a senha em texto puro. */
export class Credencial {
  readonly id?: string;
  readonly usuarioId: string;
  readonly tipoEntrada: TipoEntradaCredencial;
  readonly entrada: string;
  readonly senhaHash: string;

  constructor(props: CredencialProps) {
    this.id = props.id;
    this.usuarioId = props.usuarioId;
    this.tipoEntrada = props.tipoEntrada;
    this.entrada = String(props.entrada).trim();
    this.senhaHash = props.senhaHash;
  }
}

// Importe o 'express-session' original. Isso é importante para estabelecer o contexto.
import 'express-session';

// Use 'declare module' para "reabrir" o módulo original do express-session
declare module 'express-session' {
  
  // Agora, reabra a interface SessionData e adicione seus campos
  // O TypeScript vai "juntar" (merge) estes campos com os que já existem.
  interface SessionData {
    idUsuario: number;
    nome: string;
    tipoConta: "fisica" | "juridica";
  }
}
/**
 * Nivel de acesso ATIVO do usuario em relacao a uma sala (Usuario.obterNivelAcessoAtivo(predio)).
 * Nao e persistido: deriva do tipo de credencial e das lotacoes de coordenacao vigentes.
 * O documento tambem cita ADMIN_CAMPUS, mas nao define regras para ele; por isso nao foi incluido.
 */
export enum NivelAcesso {
  ALUNO = "ALUNO",
  PROFESSOR = "PROFESSOR",
  COORDENADOR = "COORDENADOR",
}


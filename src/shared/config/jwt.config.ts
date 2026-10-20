import type { Algorithm, SignOptions, VerifyOptions } from "jsonwebtoken";

export type AmbienteExecucao = "development" | "test" | "production";

export interface ConfiguracaoJwt {
  ambiente: AmbienteExecucao;
  secret: string;
  expiresIn: NonNullable<SignOptions["expiresIn"]>;
  algorithm: Algorithm;
  algorithms: Algorithm[];
}
  
const COMPRIMENTO_MINIMO_SEGREDO = 32;
const EXPIRACAO_PADRAO_TOKEN = "8h";
const ALGORITMO_PADRAO_JWT: Algorithm = "HS256";
const FORMATO_EXPIRACAO_VALIDO = /^\d+(ms|s|m|h|d|w|y)?$/i;

/**
 * Padroes de placeholders, exemplos ou segredos de desenvolvimento/teste que
 * jamais podem ser aceitos quando NODE_ENV=production.
 */
const PADROES_PROIBIDOS_PRODUCAO: readonly RegExp[] = [
  /change[-_]?me/i,
  /substitua/i,
  /placeholder/i,
  /exemplo/i,
  /example/i,
  /seu[-_]?segredo/i,
  /your[-_]?secret/i,
  /^super_secret_jwt_key_hackaton_2026$/i,
  /^dev[-_]/i,
  /^test[-_]/i,
];

export function resolverAmbienteExecucao(
  env: NodeJS.ProcessEnv = process.env,
): AmbienteExecucao {
  const bruto = env.NODE_ENV?.trim();
  if (!bruto || bruto === "development") return "development";
  if (bruto === "test") return "test";
  if (bruto === "production") return "production";

  throw new Error(
    `NODE_ENV invalido ("${bruto}"). Valores suportados: development, test, production.`,
  );
}

function selecionarVariavelSegredoPorAmbiente(
  ambiente: AmbienteExecucao,
  env: NodeJS.ProcessEnv,
): { valor: string | undefined; nomeVariavelEsperada: string } {
  switch (ambiente) {
    case "production":
      return {
        valor: env.JWT_SECRET_PRODUCTION ?? env.JWT_SECRET,
        nomeVariavelEsperada: "JWT_SECRET_PRODUCTION (ou JWT_SECRET)",
      };
    case "test":
      return {
        valor: env.JWT_SECRET_TEST ?? env.JWT_SECRET,
        nomeVariavelEsperada: "JWT_SECRET_TEST (ou JWT_SECRET)",
      };
    case "development":
      return {
        valor: env.JWT_SECRET_DEVELOPMENT ?? env.JWT_SECRET,
        nomeVariavelEsperada: "JWT_SECRET_DEVELOPMENT (ou JWT_SECRET)",
      };
  }
}

export function obterJwtSecret(
  configurado?: string,
  env: NodeJS.ProcessEnv = process.env,
): string {
  const ambiente = resolverAmbienteExecucao(env);
  const { valor: valorAmbiente, nomeVariavelEsperada } =
    selecionarVariavelSegredoPorAmbiente(ambiente, env);

  const candidato =
    configurado !== undefined && configurado !== ""
      ? configurado
      : valorAmbiente;
  const segredo = typeof candidato === "string" ? candidato.trim() : "";

  if (!segredo || segredo.length < COMPRIMENTO_MINIMO_SEGREDO) {
    throw new Error(
      `Configuracao JWT invalida para o ambiente "${ambiente}": defina ${nomeVariavelEsperada} com pelo menos ${COMPRIMENTO_MINIMO_SEGREDO} caracteres.`,
    );
  }

  const segredoDev = env.JWT_SECRET_DEVELOPMENT?.trim();
  const segredoTest = env.JWT_SECRET_TEST?.trim();
  const segredoProd = env.JWT_SECRET_PRODUCTION?.trim();

  if (ambiente === "production") {
    for (const padrao of PADROES_PROIBIDOS_PRODUCAO) {
      if (padrao.test(segredo)) {
        throw new Error(
          "Configuracao JWT insegura para producao: o segredo configurado contem valor de exemplo, placeholder ou chave de desenvolvimento/teste.",
        );
      }
    }

    if ((segredoDev && segredo === segredoDev) || (segredoTest && segredo === segredoTest)) {
      throw new Error(
        "Configuracao JWT insegura para producao: o segredo de producao nao pode reutilizar o segredo de development ou test.",
      );
    }
  } else if (ambiente === "test") {
    if (segredoProd && segredo === segredoProd) {
      throw new Error(
        "Configuracao JWT invalida para test: o ambiente de teste nao pode reutilizar o segredo de producao.",
      );
    }
    if (segredoDev && segredo === segredoDev) {
      throw new Error(
        "Configuracao JWT invalida para test: defina um segredo de teste distinto do segredo de desenvolvimento.",
      );
    }
  } else if (ambiente === "development") {
    if (segredoProd && segredo === segredoProd) {
      throw new Error(
        "Configuracao JWT invalida para development: o ambiente de desenvolvimento nao pode reutilizar o segredo de producao.",
      );
    }
  }

  return segredo;
}

export function obterJwtExpiresIn(
  env: NodeJS.ProcessEnv = process.env,
): NonNullable<SignOptions["expiresIn"]> {
  const bruto = env.JWT_EXPIRES_IN?.trim();
  if (!bruto) return EXPIRACAO_PADRAO_TOKEN;

  if (!FORMATO_EXPIRACAO_VALIDO.test(bruto)) {
    throw new Error(
      'JWT_EXPIRES_IN invalido. Use um formato suportado como "8h", "30m", "1d" ou segundos inteiros.',
    );
  }

  return bruto as NonNullable<SignOptions["expiresIn"]>;
}

export function obterConfiguracaoJwt(
  segredoExplicito?: string,
  env: NodeJS.ProcessEnv = process.env,
): ConfiguracaoJwt {
  const ambiente = resolverAmbienteExecucao(env);
  const secret = obterJwtSecret(segredoExplicito, env);
  const expiresIn = obterJwtExpiresIn(env);

  return {
    ambiente,
    secret,
    expiresIn,
    algorithm: ALGORITMO_PADRAO_JWT,
    algorithms: [ALGORITMO_PADRAO_JWT],
  };
}

export function obterOpcoesAssinaturaJwt(
  subject: string,
  env: NodeJS.ProcessEnv = process.env,
): SignOptions {
  return {
    subject,
    expiresIn: obterJwtExpiresIn(env),
    algorithm: ALGORITMO_PADRAO_JWT,
  };
}

export function obterOpcoesVerificacaoJwt(): VerifyOptions {
  return {
    algorithms: [ALGORITMO_PADRAO_JWT],
  };
}

export function validarConfiguracaoJwt(
  env: NodeJS.ProcessEnv = process.env,
): ConfiguracaoJwt {
  return obterConfiguracaoJwt(undefined, env);
}

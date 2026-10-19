/**
 * Erros de aplicacao com semantica HTTP. Services e componentes de dominio lancam estes erros;
 * o error handler central os converte em respostas.
 */
export class AppError extends Error {
  constructor(
    message: string,
    readonly statusCode: number,
    readonly codigo: string,
    readonly detalhes?: unknown,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

/** Payload/parametros malformados (400). */
export class ValidationError extends AppError {
  constructor(message: string, detalhes?: unknown) {
    super(message, 400, "VALIDACAO", detalhes);
  }
}

/** Ator nao identificado ou inativo (401). */
export class UnauthorizedError extends AppError {
  constructor(message = "Usuario nao autenticado.") {
    super(message, 401, "NAO_AUTENTICADO");
  }
}

/** Ator identificado, mas sem permissao para a operacao (403). */
export class ForbiddenError extends AppError {
  constructor(message: string) {
    super(message, 403, "PERMISSAO_NEGADA");
  }
}

export class NotFoundError extends AppError {
  constructor(message: string) {
    super(message, 404, "NAO_ENCONTRADO");
  }
}

/** Conflito de estado/recurso, ex.: sala ja reservada ou alteracao concorrente (409). */
export class ConflictError extends AppError {
  constructor(message: string, detalhes?: unknown) {
    super(message, 409, "CONFLITO", detalhes);
  }
}

/** Violacao de regra de negocio com payload valido (422). */
export class BusinessRuleError extends AppError {
  constructor(message: string, detalhes?: unknown) {
    super(message, 422, "REGRA_DE_NEGOCIO", detalhes);
  }
}


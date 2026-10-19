const OBJECT_ID_REGEX = /^[a-f\d]{24}$/i;

export function ehObjectId(valor: unknown): valor is string {
  return typeof valor === "string" && OBJECT_ID_REGEX.test(valor);
}


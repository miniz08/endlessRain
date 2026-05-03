export class HttpError extends Error {
  statusCode: number;
  code: string;

  constructor(statusCode: number, message: string, code = "REQUEST_ERROR") {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
  }
}

export function assertString(value: unknown, field: string): string {
  if (typeof value !== "string") {
    throw new HttpError(400, `${field} must be a string`, "VALIDATION_ERROR");
  }
  const trimmed = value.trim();
  if (!trimmed) {
    throw new HttpError(400, `${field} is required`, "VALIDATION_ERROR");
  }
  return trimmed;
}

export function optionalBoolean(value: unknown, fallback = false): boolean {
  if (value === undefined || value === null) return fallback;
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    if (value === "true") return true;
    if (value === "false") return false;
  }
  throw new HttpError(400, "Expected a boolean value", "VALIDATION_ERROR");
}

export function optionalPositiveInt(value: unknown, field: string): number | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new HttpError(400, `${field} must be a positive integer`, "VALIDATION_ERROR");
  }
  return parsed;
}

export function clampScore(value: unknown, fallback: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(0, Math.min(100, Math.round(parsed)));
}

export function clampFloat(value: unknown, fallback: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(0, Math.min(1, Number(parsed.toFixed(4))));
}

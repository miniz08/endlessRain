export class HttpError extends Error {
  statusCode: number;
  code: string;

  constructor(statusCode: number, message: string, code = "REQUEST_ERROR") {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
  }
}

export type Pagination = {
  limit: number;
  cursor?: number;
};

export function assertString(value: unknown, field: string, maxLength = 5000): string {
  if (typeof value !== "string") {
    throw new HttpError(400, `${field} must be a string`, "VALIDATION_ERROR");
  }
  const trimmed = value.trim();
  if (!trimmed) {
    throw new HttpError(400, `${field} is required`, "VALIDATION_ERROR");
  }
  if (trimmed.length > maxLength) {
    throw new HttpError(400, `${field} is too long`, "VALIDATION_ERROR");
  }
  return trimmed;
}

export function optionalString(value: unknown, field: string, maxLength = 191): string | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  return assertString(value, field, maxLength);
}

export function positiveInt(value: unknown, field: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new HttpError(400, `${field} must be a positive integer`, "VALIDATION_ERROR");
  }
  return parsed;
}

export function optionalPositiveInt(value: unknown, field: string): number | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  return positiveInt(value, field);
}

export function optionalNonNegativeInt(value: unknown, field: string): number | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new HttpError(400, `${field} must be a non-negative integer`, "VALIDATION_ERROR");
  }
  return parsed;
}

export function parsePagination(query: Record<string, unknown>, defaultLimit = 20, maxLimit = 50): Pagination {
  const rawLimit = query.limit;
  const limit = rawLimit === undefined ? defaultLimit : positiveInt(rawLimit, "limit");
  return {
    limit: Math.min(limit, maxLimit),
    cursor: optionalPositiveInt(query.cursor, "cursor"),
  };
}

export function assertEmoji(value: unknown): string {
  const emoji = assertString(value, "emoji", 64);
  const length = Array.from(emoji).length;
  if (length > 16) {
    throw new HttpError(400, "emoji is too long", "VALIDATION_ERROR");
  }
  return emoji;
}

export function assertStringArray(value: unknown, field: string, maxItems = 8): string[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) {
    throw new HttpError(400, `${field} must be an array`, "VALIDATION_ERROR");
  }
  const deduped = new Set<string>();
  for (const item of value) {
    const text = assertString(item, field, 191);
    deduped.add(text);
    if (deduped.size > maxItems) {
      throw new HttpError(400, `${field} has too many items`, "VALIDATION_ERROR");
    }
  }
  return [...deduped];
}

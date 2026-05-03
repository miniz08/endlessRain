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

  if (Array.from(trimmed).length > maxLength) {
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

export function parsePagination(query: Record<string, unknown>, defaultLimit = 30, maxLimit = 100): Pagination {
  const limit = query.limit === undefined ? defaultLimit : positiveInt(query.limit, "limit");
  return {
    limit: Math.min(limit, maxLimit),
    cursor: optionalPositiveInt(query.cursor, "cursor"),
  };
}

export function buildMessageContent(contentValue: unknown, emojiValue?: unknown): string {
  const rawContent = typeof contentValue === "string" ? contentValue.trim() : "";
  const emoji = optionalString(emojiValue, "emoji", 64);
  if (emoji && Array.from(emoji).length > 16) {
    throw new HttpError(400, "emoji is too long", "VALIDATION_ERROR");
  }

  const content = rawContent || "";
  const combined = [emoji, content].filter(Boolean).join(content ? " " : "");
  if (!combined) {
    throw new HttpError(400, "content is required", "VALIDATION_ERROR");
  }

  if (Array.from(combined).length > 5000) {
    throw new HttpError(400, "content is too long", "VALIDATION_ERROR");
  }

  return combined;
}

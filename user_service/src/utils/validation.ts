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

export function optionalString(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "string") {
    throw new HttpError(400, "Optional field must be a string", "VALIDATION_ERROR");
  }
  const trimmed = value.trim();
  return trimmed || undefined;
}

export function optionalProfileBio(value: unknown): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value !== "string") {
    throw new HttpError(400, "bio must be a string", "VALIDATION_ERROR");
  }
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (Array.from(trimmed).length > 280) {
    throw new HttpError(400, "bio must be 280 characters or fewer", "VALIDATION_ERROR");
  }
  return trimmed;
}

export function assertEmail(value: unknown): string {
  const email = assertString(value, "email").toLowerCase();
  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailPattern.test(email)) {
    throw new HttpError(400, "email is invalid", "VALIDATION_ERROR");
  }
  return email;
}

export function assertUsername(value: unknown): string {
  const username = assertString(value, "username");
  if (!/^[a-zA-Z0-9_\u4e00-\u9fa5-]{2,32}$/.test(username)) {
    throw new HttpError(
      400,
      "username must be 2-32 characters and contain only letters, numbers, underscore, hyphen, or Chinese characters",
      "VALIDATION_ERROR",
    );
  }
  return username;
}

export function assertPassword(value: unknown): string {
  const password = assertString(value, "password");
  if (password.length < 8 || password.length > 128) {
    throw new HttpError(400, "password must be 8-128 characters", "VALIDATION_ERROR");
  }
  return password;
}

export function parsePositiveInt(value: unknown, field: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new HttpError(400, `${field} must be a positive integer`, "VALIDATION_ERROR");
  }
  return parsed;
}

export function normalizeRole(value: unknown): string | undefined {
  const role = optionalString(value);
  if (!role) return undefined;

  const normalized = role.toLowerCase();
  if (!["user", "reviewer", "admin"].includes(normalized)) {
    throw new HttpError(400, "role must be user, reviewer, or admin", "VALIDATION_ERROR");
  }
  return normalized;
}

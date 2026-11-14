// Reading PostgreSQL error codes through Drizzle's wrapper errors (the pg error is in `cause`).

export function pgErrorCode(error: unknown): string | undefined {
  for (let e: unknown = error; e; e = (e as { cause?: unknown }).cause) {
    const code = (e as { code?: unknown }).code;
    if (typeof code === "string") return code;
  }
  return undefined;
}

/** A unique constraint stopped a duplicate row (Postgres code 23505). */
export function isUniqueViolation(error: unknown): boolean {
  return pgErrorCode(error) === "23505";
}

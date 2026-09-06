/**
 * The schema stays Postgres-compatible by storing structured values as JSON
 * strings (SQLite has no native JSON or array columns). These helpers keep the
 * parse/stringify at the edges instead of scattered through call sites.
 */
export function toJson(value: unknown): string {
  return JSON.stringify(value)
}

export function fromJson<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw) return fallback
  try {
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

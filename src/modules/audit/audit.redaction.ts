import type { AuditFieldChange } from "./auditLog.model";

const SENSITIVE_KEY =
  /pass|token|otp|secret|aadha?r|contact|phone|authorization|cookie|clientid|signature|gender|kyc/i;
const MAX_DEPTH = 6;
const MAX_STRING = 200;
const MAX_KEYS = 50;
const IGNORED_DIFF_FIELDS = new Set(["_id", "__v", "createdAt", "updatedAt"]);

export const REDACTED = "[REDACTED]";

/**
 * Recursively redacts personal / secret values so the audit trail never
 * holds plaintext Aadhaar numbers, phone numbers, passwords or tokens.
 */
export const redact = (value: unknown, depth = 0): unknown => {
  if (value === null || value === undefined) return value;
  if (depth > MAX_DEPTH) return "[TRUNCATED]";
  if (typeof value === "string") {
    return value.length > MAX_STRING ? `${value.slice(0, MAX_STRING)}…` : value;
  }
  if (typeof value !== "object") return value;
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) {
    return value.slice(0, MAX_KEYS).map((v) => redact(v, depth + 1));
  }
  if (typeof (value as { toHexString?: unknown }).toHexString === "function") {
    return (value as { toHexString(): string }).toHexString();
  }
  const out: Record<string, unknown> = {};
  for (const [key, v] of Object.entries(value).slice(0, MAX_KEYS)) {
    out[key] = SENSITIVE_KEY.test(key) ? REDACTED : redact(v, depth + 1);
  }
  return out;
};

const comparable = (v: unknown): string => JSON.stringify(redact(v)) ?? "";

/** Field-level diff between two snapshots, with sensitive values redacted. */
export const diffChanges = (
  before: Record<string, unknown> | null | undefined,
  after: Record<string, unknown> | null | undefined,
): AuditFieldChange[] => {
  const keys = new Set([
    ...Object.keys(before ?? {}),
    ...Object.keys(after ?? {}),
  ]);
  const changes: AuditFieldChange[] = [];
  for (const field of keys) {
    if (IGNORED_DIFF_FIELDS.has(field)) continue;
    const from = before?.[field];
    const to = after?.[field];
    if (comparable(from) === comparable(to)) continue;
    const sensitive = SENSITIVE_KEY.test(field);
    changes.push({
      field,
      from: sensitive ? REDACTED : redact(from),
      to: sensitive ? REDACTED : redact(to),
    });
  }
  return changes;
};

import { config } from "../../config/env";
import { UpstreamError } from "../errors/AppError";

export interface JsonResponse {
  ok: boolean;
  status: number;
  body: unknown;
}

/**
 * fetch() with a hard timeout. Third-party calls without timeouts pin
 * request handlers (and connection-pool slots) when a provider hangs.
 */
export const fetchJson = async (
  url: string,
  init: RequestInit = {},
  timeoutMs: number = config.externalHttpTimeoutMs,
): Promise<JsonResponse> => {
  let response: Response;
  try {
    response = await fetch(url, {
      ...init,
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (err) {
    const timedOut = err instanceof Error && err.name === "TimeoutError";
    throw new UpstreamError(
      timedOut ? "Upstream service timed out" : "Upstream service unreachable",
    );
  }
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    body = null;
  }
  return { ok: response.ok, status: response.status, body };
};

/** Narrowing helper for untyped third-party JSON. */
export const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

export const getString = (obj: unknown, key: string): string | undefined => {
  if (!isRecord(obj)) return undefined;
  const v = obj[key];
  return typeof v === "string" ? v : undefined;
};

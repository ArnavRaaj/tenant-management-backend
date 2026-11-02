import { AsyncLocalStorage } from "async_hooks";

export interface AuditChange {
  resourceId?: string;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
}

/**
 * Per-request state propagated through async calls (logging correlation,
 * audit metadata). Services read/write it without depending on Express.
 */
export interface RequestContext {
  requestId: string;
  userId?: string;
  organizationId?: string;
  audit?: AuditChange;
}

const storage = new AsyncLocalStorage<RequestContext>();

export const runWithContext = <T>(ctx: RequestContext, fn: () => T): T =>
  storage.run(ctx, fn);

export const getRequestContext = (): RequestContext | undefined =>
  storage.getStore();

/** Lets a service describe the record it changed for the audit trail. */
export const recordAuditChange = (change: AuditChange): void => {
  const ctx = storage.getStore();
  if (ctx) ctx.audit = { ...ctx.audit, ...change };
};

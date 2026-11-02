import { Queue, Worker, type Job } from "bullmq";
import { config } from "../../config/env";
import { getRedis } from "../../config/redis";
import { logger } from "../logger";

/**
 * Background job queue.
 *
 *  - Redis configured → BullMQ: durable, shared by all API instances,
 *    retried with exponential backoff, survives restarts.
 *  - No Redis (dev/test) → in-process queue with the same retry semantics.
 *
 * Modules register payload types by augmenting `JobRegistry`:
 *   declare module "../../core/queue/jobQueue" {
 *     interface JobRegistry { "email.send": EmailJobData }
 *   }
 */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface JobRegistry {}
export type JobName = keyof JobRegistry & string;
type Handler<N extends JobName> = (data: JobRegistry[N]) => Promise<void>;

export interface EnqueueOptions {
  attempts?: number;
  delayMs?: number;
  /** Deduplication id (BullMQ jobId) */
  jobId?: string;
}

const QUEUE_NAME = "nivaasa-jobs";
const DEFAULT_ATTEMPTS = 4;
const BASE_BACKOFF_MS = config.isTest ? 5 : 2000;

const handlers = new Map<string, (data: unknown) => Promise<void>>();
let bullQueue: Queue | null = null;
let bullWorker: Worker | null = null;

export const registerJobHandler = <N extends JobName>(
  name: N,
  handler: Handler<N>,
): void => {
  handlers.set(name, handler as (data: unknown) => Promise<void>);
};

const runHandler = async (name: string, data: unknown): Promise<void> => {
  const handler = handlers.get(name);
  if (!handler) throw new Error(`No handler registered for job "${name}"`);
  await handler(data);
};

// ── In-process fallback ──────────────────────────────────────────────────
const inFlight = new Set<Promise<void>>();

const runInMemory = (
  name: string,
  data: unknown,
  attempt: number,
  maxAttempts: number,
  delayMs = 0,
): void => {
  const task = (async () => {
    // Defer so the caller's request completes first (non-blocking).
    await new Promise((r) =>
      delayMs > 0 ? setTimeout(r, delayMs) : setImmediate(r),
    );
    try {
      await runHandler(name, data);
    } catch (err) {
      if (attempt < maxAttempts) {
        const delay = BASE_BACKOFF_MS * 2 ** (attempt - 1);
        logger.warn(
          { job: name, attempt, err: (err as Error).message },
          `Job failed, retrying in ${delay}ms`,
        );
        runInMemory(name, data, attempt + 1, maxAttempts, delay);
      } else {
        logger.error(
          { job: name, attempt, err: (err as Error).message },
          "Job permanently failed",
        );
      }
    }
  })();
  inFlight.add(task);
  void task.finally(() => inFlight.delete(task));
};

// ── Public API ───────────────────────────────────────────────────────────
export const enqueueJob = async <N extends JobName>(
  name: N,
  data: JobRegistry[N],
  opts: EnqueueOptions = {},
): Promise<void> => {
  const attempts = opts.attempts ?? DEFAULT_ATTEMPTS;
  if (bullQueue) {
    await bullQueue.add(name, data, {
      attempts,
      backoff: { type: "exponential", delay: BASE_BACKOFF_MS },
      removeOnComplete: 1000,
      removeOnFail: 5000,
      ...(opts.delayMs ? { delay: opts.delayMs } : {}),
      ...(opts.jobId ? { jobId: opts.jobId } : {}),
    });
    return;
  }
  runInMemory(name, data, 1, attempts, opts.delayMs ?? 0);
};

export const startJobQueue = (): void => {
  const redis = getRedis();
  if (!redis) {
    logger.warn(
      "REDIS_URL not set: using in-process job queue (jobs are lost on restart; single instance only)",
    );
    return;
  }
  bullQueue = new Queue(QUEUE_NAME, { connection: redis });
  if (config.runWorkers) {
    bullWorker = new Worker(
      QUEUE_NAME,
      async (job: Job) => runHandler(job.name, job.data),
      { connection: redis.duplicate(), concurrency: 10 },
    );
    bullWorker.on("failed", (job, err) =>
      logger.error(
        {
          job: job?.name,
          id: job?.id,
          attempts: job?.attemptsMade,
          err: err.message,
        },
        "Background job failed",
      ),
    );
    logger.info("BullMQ worker started");
  }
};

export const stopJobQueue = async (): Promise<void> => {
  await bullWorker?.close();
  await bullQueue?.close();
  bullWorker = null;
  bullQueue = null;
  await drainInMemoryJobs();
};

/** Waits for in-process jobs (used by tests and graceful shutdown). */
export const drainInMemoryJobs = async (): Promise<void> => {
  // Loop because a finishing job may schedule a retry / follow-up job.
  for (let i = 0; i < 50 && inFlight.size > 0; i++) {
    await Promise.allSettled([...inFlight]);
    await new Promise((r) => setImmediate(r));
  }
};

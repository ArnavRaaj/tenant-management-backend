import { describe, it, expect } from "vitest";
import { EmailQueueService } from "../src/queues/email.queue";

describe("Asynchronous Background Email Queue", () => {
  it("should initialize with default stats", () => {
    const queue = new EmailQueueService(2, 3);
    const stats = queue.getStats();

    expect(stats.totalEnqueued).toBe(0);
    expect(stats.totalCompleted).toBe(0);
    expect(stats.totalFailed).toBe(0);
  });

  it("should enqueue and track an OTP email job", () => {
    const queue = new EmailQueueService(1, 1);

    const jobId = queue.enqueueOtpEmail(
      "tenant@example.com",
      "123456",
      "verification",
    );

    expect(jobId).toBeDefined();
    expect(jobId.startsWith("job_")).toBe(true);
    expect(queue.getStats().totalEnqueued).toBe(1);
  });

  it("should track multiple queued jobs including admin invites and welcome emails", () => {
    const queue = new EmailQueueService(2, 3);

    const inviteJobId = queue.enqueueAdminInvite(
      "newadmin@example.com",
      "https://tenant.app/invite?token=xyz",
    );
    const welcomeJobId = queue.enqueueWelcomeEmail(
      "tenant@example.com",
      "John Doe",
    );

    expect(inviteJobId.startsWith("job_")).toBe(true);
    expect(welcomeJobId.startsWith("job_")).toBe(true);
    expect(queue.getStats().totalEnqueued).toBe(2);
  });
});

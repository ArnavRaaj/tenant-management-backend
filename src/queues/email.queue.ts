import EventEmitter from "events";
import {
  sendEmail,
  sendOtpEmail,
  sendAdminInviteEmail,
} from "../utils/emailService";

export type EmailJobType =
  | "OTP_EMAIL"
  | "ADMIN_INVITE"
  | "WELCOME_EMAIL"
  | "CUSTOM_EMAIL";

export interface EmailJob {
  id: string;
  type: EmailJobType;
  payload: any;
  attempts: number;
  maxRetries: number;
  createdAt: Date;
}

export class EmailQueueService extends EventEmitter {
  private queue: EmailJob[] = [];
  private activeJobs = 0;
  private readonly concurrency: number;
  private readonly defaultMaxRetries: number;

  private stats = {
    totalEnqueued: 0,
    totalCompleted: 0,
    totalFailed: 0,
  };

  constructor(concurrency = 2, defaultMaxRetries = 3) {
    super();
    this.concurrency = concurrency;
    this.defaultMaxRetries = defaultMaxRetries;
  }

  /**
   * Enqueue a generic email job
   */
  public enqueue(type: EmailJobType, payload: any, maxRetries = this.defaultMaxRetries): string {
    const id = `job_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const job: EmailJob = {
      id,
      type,
      payload,
      attempts: 0,
      maxRetries,
      createdAt: new Date(),
    };

    this.queue.push(job);
    this.stats.totalEnqueued++;

    console.log(`📥 [JOB QUEUE] Enqueued ${type} job (${id}) for recipient: ${payload.to || payload.email}`);
    
    // Process next tick to allow calling code to return immediately
    setImmediate(() => this.processNext());
    return id;
  }

  /**
   * Enqueue OTP verification / password reset email
   */
  public enqueueOtpEmail(
    email: string,
    otp: string,
    purpose: "verification" | "forgot_password",
  ): string {
    return this.enqueue("OTP_EMAIL", { email, otp, purpose });
  }

  /**
   * Enqueue Admin invitation email
   */
  public enqueueAdminInvite(email: string, inviteLink: string): string {
    return this.enqueue("ADMIN_INVITE", { email, inviteLink });
  }

  /**
   * Enqueue Welcome email
   */
  public enqueueWelcomeEmail(email: string, name: string): string {
    const welcomeHtml = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #0b1120; color: #f8fafc; padding: 40px 20px;">
        <div style="max-width: 500px; margin: 0 auto; background: #1e293b; border-radius: 12px; padding: 32px; border: 1px solid #334155;">
          <h2 style="color: #60a5fa; margin-top: 0;">Welcome to Tenant Management, ${name}!</h2>
          <p style="color: #94a3b8; line-height: 1.6;">Your account has been successfully verified. You now have full access to your organization property portal, flats, tenants, and revenue analytics.</p>
          <div style="margin-top: 24px; padding-top: 20px; border-top: 1px solid #334155; font-size: 12px; color: #64748b;">
            © ${new Date().getFullYear()} Tenant Management System. All rights reserved.
          </div>
        </div>
      </div>
    `;

    return this.enqueue("CUSTOM_EMAIL", {
      to: email,
      subject: "Welcome to Tenant Management System!",
      html: welcomeHtml,
      text: `Welcome to Tenant Management System, ${name}! Your account is now active.`,
    });
  }

  /**
   * Get queue health metrics
   */
  public getStats() {
    return {
      pending: this.queue.length,
      active: this.activeJobs,
      totalEnqueued: this.stats.totalEnqueued,
      totalCompleted: this.stats.totalCompleted,
      totalFailed: this.stats.totalFailed,
    };
  }

  /**
   * Worker loop
   */
  private async processNext(): Promise<void> {
    if (this.activeJobs >= this.concurrency || this.queue.length === 0) {
      return;
    }

    const job = this.queue.shift();
    if (!job) return;

    this.activeJobs++;
    job.attempts++;

    try {
      await this.executeJob(job);
      this.stats.totalCompleted++;
      this.emit("job:completed", job);
      console.log(`✅ [JOB QUEUE] Finished ${job.type} (${job.id}) successfully.`);
    } catch (error: any) {
      console.error(`⚠️ [JOB QUEUE] Job ${job.id} (${job.type}) failed attempt ${job.attempts}/${job.maxRetries}:`, error.message);

      if (job.attempts < job.maxRetries) {
        // Exponential backoff retry: 2s, 4s, 8s
        const backoffDelay = Math.pow(2, job.attempts) * 1000;
        console.log(`🔄 [JOB QUEUE] Re-queuing ${job.id} in ${backoffDelay / 1000}s...`);
        
        setTimeout(() => {
          this.queue.push(job);
          this.processNext();
        }, backoffDelay);
      } else {
        this.stats.totalFailed++;
        this.emit("job:failed", { job, error });
        console.error(`❌ [JOB QUEUE] Job ${job.id} permanently failed after ${job.attempts} attempts.`);
      }
    } finally {
      this.activeJobs--;
      this.processNext();
    }
  }

  /**
   * Executes the corresponding email action based on job type
   */
  private async executeJob(job: EmailJob): Promise<any> {
    const { type, payload } = job;

    switch (type) {
      case "OTP_EMAIL":
        return await sendOtpEmail(payload.email, payload.otp, payload.purpose);

      case "ADMIN_INVITE":
        return await sendAdminInviteEmail(payload.email, payload.inviteLink);

      case "WELCOME_EMAIL":
      case "CUSTOM_EMAIL":
        return await sendEmail({
          to: payload.to,
          subject: payload.subject,
          html: payload.html,
          text: payload.text,
        });

      default:
        throw new Error(`Unknown job type: ${type}`);
    }
  }
}

export const emailQueue = new EmailQueueService();

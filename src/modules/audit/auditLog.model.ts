import mongoose, { Schema, type Types } from "mongoose";
import { config } from "../../config/env";

export interface AuditFieldChange {
  field: string;
  from: unknown;
  to: unknown;
}

/**
 * Immutable audit trail — WHO did WHAT to WHICH record, WHEN, from WHERE,
 * and whether it succeeded.
 */
export interface AuditLogDoc {
  _id: Types.ObjectId;
  // WHO
  organizationId: Types.ObjectId | null;
  actor: {
    userId: Types.ObjectId | null;
    email: string;
    role: string;
  };
  ip: string;
  userAgent: string;
  // WHAT
  action: string;
  resource: string;
  resourceId: string | null;
  method: string;
  path: string;
  statusCode: number;
  outcome: "SUCCESS" | "FAILURE";
  changes: AuditFieldChange[];
  request: Record<string, unknown>;
  requestId: string;
  durationMs: number;
  // WHEN
  createdAt: Date;
}

const AuditLogSchema = new Schema<AuditLogDoc>(
  {
    organizationId: { type: Schema.Types.ObjectId, ref: "User", default: null },
    actor: {
      userId: { type: Schema.Types.ObjectId, ref: "User", default: null },
      email: { type: String, default: "" },
      role: { type: String, default: "anonymous" },
    },
    ip: { type: String, default: "" },
    userAgent: { type: String, default: "", maxlength: 512 },
    action: { type: String, required: true },
    resource: { type: String, required: true },
    resourceId: { type: String, default: null },
    method: { type: String, required: true },
    path: { type: String, required: true },
    statusCode: { type: Number, required: true },
    outcome: { type: String, enum: ["SUCCESS", "FAILURE"], required: true },
    changes: {
      type: [
        new Schema(
          { field: String, from: Schema.Types.Mixed, to: Schema.Types.Mixed },
          { _id: false },
        ),
      ],
      default: [],
    },
    request: { type: Schema.Types.Mixed, default: {} },
    requestId: { type: String, default: "" },
    durationMs: { type: Number, default: 0 },
  },
  { timestamps: { createdAt: true, updatedAt: false }, versionKey: false },
);

AuditLogSchema.index({ organizationId: 1, _id: -1 });
AuditLogSchema.index({ organizationId: 1, "actor.userId": 1, _id: -1 });
AuditLogSchema.index({ organizationId: 1, action: 1, _id: -1 });
AuditLogSchema.index({
  organizationId: 1,
  resource: 1,
  resourceId: 1,
  _id: -1,
});
// Retention: MongoDB deletes entries older than AUDIT_RETENTION_DAYS.
AuditLogSchema.index(
  { createdAt: 1 },
  { expireAfterSeconds: config.auditRetentionDays * 24 * 60 * 60 },
);

export const AuditLog = mongoose.model<AuditLogDoc>("AuditLog", AuditLogSchema);

import { Types } from "mongoose";
import { invalidateDashboard } from "../../core/cache/cache";
import { formatSequence, nextSequence } from "../../core/db/counter.model";
import { pageMeta, toSkip, type PageQuery } from "../../core/db/pagination";
import { withTransaction } from "../../core/db/transaction";
import { NotFoundError, UnprocessableError } from "../../core/errors/AppError";
import { recordAuditChange } from "../../core/requestContext";
import { decryptOrNull } from "../../core/security/crypto";
import { toPaise, toRupees } from "../../core/utils/money";
import {
  currentPeriod,
  monthNumberFromName,
  periodLabel,
  toPeriod,
  zonedParts,
} from "../../core/utils/period";
import { normalizePhone } from "../../core/utils/text";
import type { AuthContext } from "../../types/express";
import { flatRepository } from "../flats/flat.repository";
import {
  queueWhatsAppText,
  receiptMessage,
  receiptText,
} from "../whatsapp/whatsapp.service";
import { toRentRecordDto, type TenantRecord } from "./tenant.mapper";
import type { PaymentMode, RentHistoryDoc } from "./rent.model";
import type { PaymentPattern } from "./tenant.model";
import { rentRepository, tenantRepository } from "./tenant.repository";

export interface RecordRentInput {
  amountPaid: number;
  rentMonth: string;
  rentYear: number;
  paymentDate?: Date;
  paymentMode?: PaymentMode;
  referenceId?: string;
  notes?: string;
}

/** On-time (1st–5th), mid-month (6th–15th) or late, relative to the rent period (IST). */
export const classifyPayment = (
  paymentDate: Date,
  period: number,
): PaymentPattern => {
  const paid = zonedParts(paymentDate);
  const paidPeriod = toPeriod(paid.year, paid.month);
  if (paidPeriod < period) return "ON_TIME";
  if (paidPeriod > period) return "CHRONIC_LATE";
  if (paid.day <= 5) return "ON_TIME";
  if (paid.day <= 15) return "MID_MONTH";
  return "CHRONIC_LATE";
};

const buildReceiptResponse = (
  record: RentHistoryDoc,
  tenant: TenantRecord,
  replayed: boolean,
) => {
  const flatNumber =
    tenant.flat && !(tenant.flat instanceof Types.ObjectId)
      ? tenant.flat.flatNumber
      : "N/A";
  const text = receiptText({
    receiptNumber: record.receiptNumber,
    flatNumber,
    tenantName: tenant.name,
    amountPaise: record.amountPaid,
    paymentMode: record.paymentMode,
    periodLabel: periodLabel(record.period),
    remainingPaise: tenant.pendingBalance,
    paymentDate: record.paymentDate,
  });
  return {
    ...toRentRecordDto(record),
    receiptText: text,
    remainingBalance: toRupees(tenant.pendingBalance),
    paymentPattern: tenant.paymentPattern,
    isCurrentMonthPaid: (tenant.lastPaidPeriod ?? 0) >= currentPeriod(),
    lastPaidMonth: periodLabel(tenant.lastPaidPeriod ?? record.period).split(
      " ",
    )[0],
    lastPaidYear: Math.floor((tenant.lastPaidPeriod ?? record.period) / 100),
    replayed,
  };
};

/**
 * Records a rent payment atomically:
 *   receipt number (sequence) + payment record + tenant balance/pattern
 * all commit together or not at all. An Idempotency-Key makes retries
 * (double-clicks, flaky networks) return the original receipt instead of
 * charging twice.
 */
export const recordRentPayment = async (
  auth: AuthContext,
  tenantId: string,
  input: RecordRentInput,
  idempotencyKey: string | null,
) => {
  if (idempotencyKey) {
    const existing = await rentRepository.findByIdempotencyKey(
      auth.organizationId,
      idempotencyKey,
    );
    if (existing) {
      const tenant = await tenantRepository.findById(
        existing.tenant.toHexString(),
        auth.organizationId,
      );
      if (tenant) return buildReceiptResponse(existing, tenant, true);
    }
  }

  const month = monthNumberFromName(input.rentMonth);
  if (!month) throw new UnprocessableError("Invalid rent month");
  const period = toPeriod(input.rentYear, month);
  const amountPaise = toPaise(input.amountPaid);
  const paymentDate = input.paymentDate ?? new Date();
  const pattern = classifyPayment(paymentDate, period);

  let result: {
    record: RentHistoryDoc;
    tenant: TenantRecord;
    before: TenantRecord;
  };
  try {
    result = await withTransaction(async (tx) => {
      const tenant = await tenantRepository.findById(
        tenantId,
        auth.organizationId,
        tx.session,
      );
      if (!tenant) throw new NotFoundError("Tenant not found");
      const flatId =
        tenant.flat instanceof Types.ObjectId ? tenant.flat : tenant.flat?._id;
      const flat = flatId
        ? await flatRepository.findById(
            flatId.toHexString(),
            auth.organizationId,
            tx.session,
          )
        : null;

      const seq = await nextSequence(
        `${auth.organizationId}:receipt:${period}`,
        tx.session,
      );
      const record = await rentRepository.create(
        {
          tenant: tenant._id,
          flat: flatId ?? tenant._id,
          floor: flat?.floor ?? 0,
          amountPaid: amountPaise,
          paymentDate,
          period,
          rentMonth: month,
          rentYear: input.rentYear,
          paymentMode: input.paymentMode ?? "CASH",
          receiptNumber: formatSequence("REC", period, seq),
          referenceId: input.referenceId ?? "",
          notes: input.notes ?? "",
          idempotencyKey,
          recordedBy: new Types.ObjectId(auth.userId),
          organizationId: new Types.ObjectId(auth.organizationId),
        },
        tx.session,
      );

      // Atomic server-side balance update (no read-modify-write race):
      //  - arrears outstanding → payment reduces them (overpayment becomes credit)
      //  - no arrears → this month's rent is charged and the payment applied
      const updated = await tenantRepository.update(
        tenant._id,
        auth.organizationId,
        [
          {
            $set: {
              pendingBalance: {
                $cond: [
                  { $gt: ["$pendingBalance", 0] },
                  { $subtract: ["$pendingBalance", amountPaise] },
                  {
                    $add: [
                      "$pendingBalance",
                      { $subtract: ["$monthlyRent", amountPaise] },
                    ],
                  },
                ],
              },
              lastPaidPeriod: {
                $max: [{ $ifNull: ["$lastPaidPeriod", 0] }, period],
              },
              paymentPattern: pattern,
            },
          },
        ],
        tx.session,
      );
      if (!updated) throw new NotFoundError("Tenant not found");

      tx.afterCommit(async () => {
        await invalidateDashboard(auth.organizationId);
        const phone = decryptOrNull(updated.contactNumber);
        const job = receiptMessage(
          {
            _id: updated._id,
            name: updated.name,
            contactNumber: phone ? normalizePhone(phone) : null,
          },
          auth.organizationId,
          buildReceiptResponse(record, updated, false).receiptText,
          record.receiptNumber,
        );
        if (job) await queueWhatsAppText(job);
      });
      return { record, tenant: updated, before: tenant };
    });
  } catch (err) {
    // Two concurrent requests with the same Idempotency-Key: the loser hits
    // the unique index; return the winner's receipt.
    if (idempotencyKey && (err as { code?: number }).code === 11000) {
      const existing = await rentRepository.findByIdempotencyKey(
        auth.organizationId,
        idempotencyKey,
      );
      const tenant = existing
        ? await tenantRepository.findById(
            existing.tenant.toHexString(),
            auth.organizationId,
          )
        : null;
      if (existing && tenant)
        return buildReceiptResponse(existing, tenant, true);
    }
    throw err;
  }

  recordAuditChange({
    resourceId: tenantId,
    before: {
      pendingBalance: toRupees(result.before.pendingBalance),
      lastPaidPeriod: result.before.lastPaidPeriod,
    },
    after: {
      receiptNumber: result.record.receiptNumber,
      amountPaid: toRupees(result.record.amountPaid),
      pendingBalance: toRupees(result.tenant.pendingBalance),
      lastPaidPeriod: result.tenant.lastPaidPeriod,
    },
  });
  return buildReceiptResponse(result.record, result.tenant, false);
};

export const listRentHistory = async (
  auth: AuthContext,
  tenantId: string,
  page: PageQuery,
) => {
  const tenant = await tenantRepository.findById(tenantId, auth.organizationId);
  if (!tenant) throw new NotFoundError("Tenant not found");
  const { items, total } = await rentRepository.listForTenant(
    tenantId,
    auth.organizationId,
    toSkip(page),
    page.limit,
  );
  return { items: items.map(toRentRecordDto), meta: pageMeta(page, total) };
};

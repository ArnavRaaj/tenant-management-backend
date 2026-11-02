import { Types, type ClientSession } from "mongoose";
import { pageMeta, toSkip, type PageQuery } from "../../core/db/pagination";
import { withTransaction, type TxContext } from "../../core/db/transaction";
import {
  ConflictError,
  NotFoundError,
  UnprocessableError,
} from "../../core/errors/AppError";
import { recordAuditChange } from "../../core/requestContext";
import { blindIndex, decryptOrNull, encrypt } from "../../core/security/crypto";
import { toPaise } from "../../core/utils/money";
import {
  maskAadhaar,
  MASKED_AADHAAR_PATTERN,
  normalizePhone,
} from "../../core/utils/text";
import type { AuthContext } from "../../types/express";
import { flatRepository } from "../flats/flat.repository";
import { issueKycToken, kycLinkFor, storedKycToken } from "../kyc/kyc.tokens";
import {
  buildAssetPath,
  deleteAsset,
  parseAsset,
  serializeAsset,
  uploadPrivate,
  type StoredAsset,
} from "../storage/storage.service";
import {
  onboardingMessage,
  queueWhatsAppText,
} from "../whatsapp/whatsapp.service";
import {
  tenantAuditSnapshot,
  toTenantDto,
  type TenantDto,
  type TenantRecord,
} from "./tenant.mapper";
import {
  TENANT_SCHEMA_VERSION,
  type Gender,
  type TenantAddress,
  type TenantDoc,
} from "./tenant.model";
import { tenantRepository } from "./tenant.repository";

export interface TenantInput {
  name: string;
  contactNumber: string;
  age?: number;
  aadharNumber?: string;
  gender?: Gender;
  address?: Partial<TenantAddress>;
  occupantsCount?: number;
  securityDeposit: number;
  monthlyRent: number;
  pendingBalance?: number;
  dateOfRenting?: Date;
}

export type TenantUpdateInput = Partial<TenantInput>;

export interface UploadedFile {
  buffer: Buffer;
}

export const contactHash = (phone: string): string =>
  blindIndex(normalizePhone(phone), "phone");

const aadhaarFields = (value: string | undefined) => {
  if (!value || MASKED_AADHAAR_PATTERN.test(value)) return null; // masked = unchanged
  const digits = value.replace(/\D/g, "");
  return {
    aadhaarMasked: maskAadhaar(digits),
    aadhaarHash: blindIndex(digits, "aadhaar"),
  };
};

const normaliseAddress = (
  a: Partial<TenantAddress> | undefined,
): TenantAddress => ({
  addressLine1: a?.addressLine1 ?? "",
  addressLine2: a?.addressLine2 ?? "",
  city: a?.city ?? "",
  postalCode: a?.postalCode ?? "",
  state: a?.state ?? "",
});

/** Uploads the Aadhaar document before the DB transaction (it can't be rolled back by Mongo). */
const uploadAadhaar = async (
  organizationId: string,
  tenantId: Types.ObjectId,
  file: UploadedFile | undefined,
): Promise<StoredAsset | null> => {
  if (!file) return null;
  return uploadPrivate(
    file.buffer,
    buildAssetPath({
      organizationId,
      entity: "tenants",
      entityId: tenantId.toHexString(),
      category: "kyc",
      baseName: "aadhaar",
    }),
  );
};

const flatNumberOf = (t: TenantRecord): string =>
  t.flat && !(t.flat instanceof Types.ObjectId) ? t.flat.flatNumber : "N/A";

// ── Queries ──────────────────────────────────────────────────────────────
export const listTenants = async (
  auth: AuthContext,
  query: PageQuery & { status?: "active" | "past"; rentDue?: boolean },
) => {
  const { items, total } = await tenantRepository.list(
    auth.organizationId,
    {
      isActive: query.status !== "past",
      ...(query.rentDue ? { rentDue: true } : {}),
    },
    toSkip(query),
    query.limit,
  );
  return {
    items: items.map((t) => toTenantDto(t)),
    meta: pageMeta(query, total),
  };
};

export const getTenant = async (
  auth: AuthContext,
  id: string,
): Promise<TenantDto> => {
  const tenant = await tenantRepository.findById(id, auth.organizationId);
  if (!tenant) throw new NotFoundError("Tenant not found");
  return toTenantDto(tenant, { includeDocumentUrl: true });
};

// ── Commands ─────────────────────────────────────────────────────────────
/**
 * Creates the tenant and claims the flat inside one transaction.
 * Shared by "assign" and "change tenant".
 */
const createTenantInTx = async (
  tx: TxContext,
  auth: AuthContext,
  flatId: string,
  input: TenantInput,
  tenantId: Types.ObjectId,
  asset: StoredAsset | null,
): Promise<{ tenant: TenantRecord; kycLink: string }> => {
  const flat = await flatRepository.claimForTenant(
    flatId,
    auth.organizationId,
    tenantId,
    tx.session,
  );
  if (!flat) {
    const exists = await flatRepository.findById(
      flatId,
      auth.organizationId,
      tx.session,
    );
    if (!exists) throw new NotFoundError("Flat not found");
    throw new ConflictError("Flat is already occupied");
  }

  const kyc = issueKycToken(auth.organizationId);
  const aadhaar = aadhaarFields(input.aadharNumber);
  const contactNumber = normalizePhone(input.contactNumber);

  const created = await tenantRepository.create(
    {
      _id: tenantId,
      name: input.name,
      contactNumber: encrypt(contactNumber),
      contactNumberHash: contactHash(contactNumber),
      age: input.age ?? null,
      aadhaarMasked: aadhaar?.aadhaarMasked ?? null,
      aadhaarHash: aadhaar?.aadhaarHash ?? null,
      gender: input.gender ?? null,
      aadharImage: asset ? encrypt(serializeAsset(asset)) : null,
      address: normaliseAddress(input.address),
      occupantsCount: input.occupantsCount ?? 1,
      securityDeposit: toPaise(input.securityDeposit),
      monthlyRent: toPaise(input.monthlyRent),
      pendingBalance: toPaise(input.pendingBalance ?? 0),
      isActive: true,
      dateOfRenting: input.dateOfRenting ?? new Date(),
      flat: flat._id,
      organizationId: new Types.ObjectId(auth.organizationId),
      kycStatus: "PENDING",
      kycTokenHash: kyc.kycTokenHash,
      kycTokenEnc: kyc.kycTokenEnc,
      kycTokenExpires: kyc.kycTokenExpires,
      schemaVersion: TENANT_SCHEMA_VERSION,
    },
    tx.session,
  );

  const tenant: TenantRecord = {
    ...created,
    flat: {
      _id: flat._id,
      flatNumber: flat.flatNumber,
      floor: flat.floor,
      buildingName: flat.buildingName,
    },
  };
  const kycLink = kycLinkFor(kyc.token);

  // Side effect only after commit: never message a tenant whose record rolled back.
  tx.afterCommit(async () => {
    const job = onboardingMessage(
      { _id: tenantId, name: input.name, contactNumber },
      auth.organizationId,
      flat.flatNumber,
      kycLink,
    );
    if (job) await queueWhatsAppText(job);
  });
  return { tenant, kycLink };
};

const vacateInTx = async (
  session: ClientSession | undefined,
  auth: AuthContext,
  tenantId: string,
): Promise<TenantRecord> => {
  const current = await tenantRepository.findById(
    tenantId,
    auth.organizationId,
    session,
  );
  if (!current) throw new NotFoundError("Tenant not found");
  if (!current.isActive) throw new ConflictError("Tenant has already vacated");

  const vacated = await tenantRepository.update(
    current._id,
    auth.organizationId,
    { $set: { isActive: false, vacatedDate: new Date() } },
    session,
    { isActive: true }, // conditional: guards against a concurrent vacate
  );
  if (!vacated) throw new ConflictError("Tenant has already vacated");

  const flatId =
    current.flat instanceof Types.ObjectId ? current.flat : current.flat?._id;
  if (flatId) {
    // Only clears the flat if it still points at THIS tenant.
    await flatRepository.releaseTenant(
      flatId,
      auth.organizationId,
      current._id,
      session,
    );
  }
  return vacated;
};

/** Runs `work` in a transaction, deleting the uploaded file if it rolls back. */
const withUploadCompensation = async <T>(
  asset: StoredAsset | null,
  work: () => Promise<T>,
): Promise<T> => {
  try {
    return await work();
  } catch (err) {
    if (asset) await deleteAsset(asset);
    throw err;
  }
};

export const assignTenant = async (
  auth: AuthContext,
  flatId: string,
  input: TenantInput,
  file?: UploadedFile,
) => {
  const tenantId = new Types.ObjectId();
  const asset = await uploadAadhaar(auth.organizationId, tenantId, file);
  const { tenant, kycLink } = await withUploadCompensation(asset, () =>
    withTransaction((tx) =>
      createTenantInTx(tx, auth, flatId, input, tenantId, asset),
    ),
  );
  recordAuditChange({
    resourceId: tenantId.toHexString(),
    after: tenantAuditSnapshot(tenant),
  });
  return { ...toTenantDto(tenant), kycLink };
};

export const changeTenant = async (
  auth: AuthContext,
  currentTenantId: string,
  input: TenantInput,
  file?: UploadedFile,
) => {
  const tenantId = new Types.ObjectId();
  const asset = await uploadAadhaar(auth.organizationId, tenantId, file);
  const { tenant, kycLink, previous } = await withUploadCompensation(
    asset,
    () =>
      withTransaction(async (tx) => {
        const old = await vacateInTx(tx.session, auth, currentTenantId);
        const flatId =
          old.flat instanceof Types.ObjectId ? old.flat : old.flat?._id;
        if (!flatId)
          throw new UnprocessableError("Current tenant has no flat assigned");
        const out = await createTenantInTx(
          tx,
          auth,
          flatId.toHexString(),
          input,
          tenantId,
          asset,
        );
        return { ...out, previous: old };
      }),
  );
  recordAuditChange({
    resourceId: tenantId.toHexString(),
    before: {
      previousTenantId: previous._id.toHexString(),
      ...tenantAuditSnapshot(previous),
    },
    after: tenantAuditSnapshot(tenant),
  });
  return { ...toTenantDto(tenant), kycLink };
};

export const vacateTenant = async (auth: AuthContext, tenantId: string) => {
  const vacated = await withTransaction((tx) =>
    vacateInTx(tx.session, auth, tenantId),
  );
  recordAuditChange({
    resourceId: tenantId,
    before: { isActive: true },
    after: { isActive: false, vacatedDate: vacated.vacatedDate },
  });
  return {
    message: "Tenant vacated successfully and flat is now vacant",
    tenant: toTenantDto(vacated),
  };
};

export const updateTenant = async (
  auth: AuthContext,
  tenantId: string,
  input: TenantUpdateInput,
  file?: UploadedFile,
): Promise<TenantDto> => {
  const existing = await tenantRepository.findById(
    tenantId,
    auth.organizationId,
  );
  if (!existing) throw new NotFoundError("Tenant not found");

  const set: Partial<TenantDoc> = {};
  if (input.name !== undefined) set.name = input.name;
  if (input.age !== undefined) set.age = input.age;
  if (input.gender !== undefined) set.gender = input.gender;
  if (input.occupantsCount !== undefined)
    set.occupantsCount = input.occupantsCount;
  if (input.dateOfRenting !== undefined)
    set.dateOfRenting = input.dateOfRenting;
  if (input.address !== undefined)
    set.address = normaliseAddress(input.address);
  if (input.securityDeposit !== undefined)
    set.securityDeposit = toPaise(input.securityDeposit);
  if (input.monthlyRent !== undefined)
    set.monthlyRent = toPaise(input.monthlyRent);
  if (input.pendingBalance !== undefined)
    set.pendingBalance = toPaise(input.pendingBalance);
  if (input.contactNumber !== undefined) {
    const phone = normalizePhone(input.contactNumber);
    set.contactNumber = encrypt(phone);
    set.contactNumberHash = contactHash(phone);
  }
  const aadhaar = aadhaarFields(input.aadharNumber);
  if (aadhaar && aadhaar.aadhaarHash !== existing.aadhaarHash) {
    if (existing.kycStatus === "VERIFIED") {
      throw new UnprocessableError(
        "Aadhaar of a KYC-verified tenant cannot be changed",
      );
    }
    Object.assign(set, aadhaar);
  }

  const asset = await uploadAadhaar(auth.organizationId, existing._id, file);
  if (asset) set.aadharImage = encrypt(serializeAsset(asset));

  const updated = await withUploadCompensation(asset, async () => {
    const out = await tenantRepository.update(
      existing._id,
      auth.organizationId,
      { $set: set },
    );
    if (!out) throw new NotFoundError("Tenant not found");
    return out;
  });

  // Replace semantics: remove the superseded private document.
  if (asset && existing.aadharImage) {
    const previous = parseAsset(decryptOrNull(existing.aadharImage));
    if (previous && !("legacyUrl" in previous)) await deleteAsset(previous);
  }

  recordAuditChange({
    resourceId: tenantId,
    before: tenantAuditSnapshot(existing),
    after: tenantAuditSnapshot(updated),
  });
  return toTenantDto(updated, { includeDocumentUrl: true });
};

/** Returns the tenant's KYC link, rotating it if missing or expired. */
export const getKycLink = async (auth: AuthContext, tenantId: string) => {
  const tenant = await tenantRepository.findById(tenantId, auth.organizationId);
  if (!tenant) throw new NotFoundError("Tenant not found");

  if (tenant.kycStatus === "VERIFIED") {
    return {
      kycStatus: "VERIFIED" as const,
      message: "Tenant is already verified",
      verifiedAt: tenant.kycVerifiedAt,
    };
  }

  let token = storedKycToken(tenant.kycTokenEnc);
  const expired =
    !tenant.kycTokenExpires || tenant.kycTokenExpires.getTime() < Date.now();
  if (!token || expired) {
    const issued = issueKycToken(auth.organizationId);
    await tenantRepository.update(tenant._id, auth.organizationId, {
      $set: {
        kycTokenHash: issued.kycTokenHash,
        kycTokenEnc: issued.kycTokenEnc,
        kycTokenExpires: issued.kycTokenExpires,
        kycStatus: "PENDING",
      },
    });
    token = issued.token;
  }
  recordAuditChange({ resourceId: tenantId });
  return {
    kycStatus: "PENDING" as const,
    kycLink: kycLinkFor(token),
    tenantName: tenant.name,
    contactNumber: decryptOrNull(tenant.contactNumber),
    flatNumber: flatNumberOf(tenant),
  };
};

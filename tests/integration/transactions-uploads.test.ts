import { afterEach, describe, expect, it, vi } from "vitest";
import { Flat } from "../../src/modules/flats/flat.model";
import { Tenant } from "../../src/modules/tenants/tenant.model";
import { tenantRepository } from "../../src/modules/tenants/tenant.repository";
import * as storage from "../../src/modules/storage/storage.service";
import { useTestDatabase } from "../helpers/db";
import {
  api,
  assignTenant,
  createFlat,
  createSuperadmin,
  tenantPayload,
} from "../helpers/factory";

vi.mock("../../src/modules/storage/storage.service", async (importOriginal) => {
  const original = await importOriginal<Record<string, unknown>>();
  return {
    ...original,
    uploadPrivate: vi.fn(async (_buf: Buffer, publicId: string) => ({
      publicId,
      format: "png",
    })),
    deleteAsset: vi.fn(async () => undefined),
  };
});

const PNG = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0,
]);

const multipart = (fields: Record<string, unknown>) => {
  const fd: Record<string, string> = {};
  for (const [k, v] of Object.entries(fields))
    if (v !== undefined) fd[k] = String(v);
  return fd;
};

describe("Atomic transactions, rollback and upload compensation", () => {
  useTestDatabase();
  afterEach(() => vi.restoreAllMocks());

  it("rolls back the flat claim when tenant creation fails mid-transaction", async () => {
    const owner = await createSuperadmin();
    const flat = await createFlat(owner);
    vi.spyOn(tenantRepository, "create").mockRejectedValueOnce(
      new Error("simulated crash"),
    );

    const res = await api()
      .post("/api/tenants")
      .set(owner.auth)
      .send(tenantPayload(flat._id));
    expect(res.status).toBe(500);
    expect(res.body.error.message).toBe("Internal server error"); // no internals leaked

    // The flat claim (first write in the transaction) was rolled back.
    expect((await Flat.findById(flat._id).lean())?.currentTenant).toBeNull();
    expect(await Tenant.countDocuments({ flat: flat._id })).toBe(0);
  });

  it("rolls back the vacate step of a tenant change if the new tenant cannot be created", async () => {
    const owner = await createSuperadmin();
    const flat = await createFlat(owner);
    const old = await assignTenant(owner, flat._id);
    vi.spyOn(tenantRepository, "create").mockRejectedValueOnce(
      new Error("simulated crash"),
    );

    const { flatId: _f, ...body } = tenantPayload(flat._id);
    const res = await api()
      .post(`/api/tenants/${old._id}/change`)
      .set(owner.auth)
      .send(body);
    expect(res.status).toBe(500);

    const oldTenant = await Tenant.findById(old._id).lean();
    expect(oldTenant?.isActive).toBe(true); // vacate undone
    expect(String((await Flat.findById(flat._id).lean())?.currentTenant)).toBe(
      old._id,
    );
  });

  it("uploads the Aadhaar document privately under an org/tenant path with no PII", async () => {
    const owner = await createSuperadmin({ name: "Sharma Properties" });
    const flat = await createFlat(owner);
    const res = await api()
      .post("/api/tenants")
      .set(owner.auth)
      .field(multipart(tenantPayload(flat._id, { name: "Rahul Sharma" })))
      .attach("aadharImage", PNG, {
        filename: "aadhaar.png",
        contentType: "image/png",
      });

    expect(res.status).toBe(201);
    expect(res.body.data.hasAadharImage).toBe(true);
    const publicId = vi
      .mocked(storage.uploadPrivate)
      .mock.calls.at(-1)?.[1] as string;
    expect(publicId).toMatch(
      new RegExp(
        `^test/orgs/${owner.orgId}/tenants/[0-9a-f]{24}/kyc/aadhaar_\\d+$`,
      ),
    );
    expect(publicId).not.toMatch(/Rahul|Sharma/);
  });

  it("deletes the uploaded file when the transaction rolls back (compensation)", async () => {
    const owner = await createSuperadmin();
    const flat = await createFlat(owner);
    await assignTenant(owner, flat._id); // flat now occupied → assignment will fail

    const res = await api()
      .post("/api/tenants")
      .set(owner.auth)
      .field(multipart(tenantPayload(flat._id)))
      .attach("aadharImage", PNG, {
        filename: "a.png",
        contentType: "image/png",
      });

    expect(res.status).toBe(409);
    expect(storage.deleteAsset).toHaveBeenCalledTimes(1);
  });

  it("rejects files whose content is not an allowed type, regardless of the claimed mimetype (415)", async () => {
    const owner = await createSuperadmin();
    const flat = await createFlat(owner);
    const res = await api()
      .post("/api/tenants")
      .set(owner.auth)
      .field(multipart(tenantPayload(flat._id)))
      .attach("aadharImage", Buffer.from("<?php echo 'pwned'; ?>"), {
        filename: "evil.png",
        contentType: "image/png",
      });
    expect(res.status).toBe(415);
    expect(res.body.error.code).toBe("UNSUPPORTED_FILE_TYPE");
  });

  it("rejects files over 5 MB (413)", async () => {
    const owner = await createSuperadmin();
    const flat = await createFlat(owner);
    const big = Buffer.concat([PNG, Buffer.alloc(5 * 1024 * 1024 + 1)]);
    const res = await api()
      .post("/api/tenants")
      .set(owner.auth)
      .field(multipart(tenantPayload(flat._id)))
      .attach("aadharImage", big, {
        filename: "big.png",
        contentType: "image/png",
      });
    expect(res.status).toBe(413);
  });
});

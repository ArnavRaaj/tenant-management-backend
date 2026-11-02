import { v2 as cloudinary, type UploadApiResponse } from "cloudinary";
import { config } from "../../config/env";
import {
  ServiceUnavailableError,
  UpstreamError,
} from "../../core/errors/AppError";
import { logger } from "../../core/logger";

/**
 * Object storage for uploaded documents/images.
 *
 * Folder layout (no personal data in paths, stable across renames/moves):
 *   {env}/orgs/{orgId}/tenants/{tenantId}/kyc/aadhaar_{timestamp}
 *   {env}/orgs/{orgId}/flats/{flatId}/photos/photo_{timestamp}
 *   {env}/orgs/{orgId}/maintenance/{ticketId}/photos/photo_{timestamp}
 *
 * Sensitive assets are uploaded as `authenticated` (not publicly readable)
 * and served through short-lived signed URLs.
 */
if (config.cloudinary.enabled) {
  cloudinary.config({
    cloud_name: config.cloudinary.cloudName,
    api_key: config.cloudinary.apiKey,
    api_secret: config.cloudinary.apiSecret,
    secure: true,
  });
}

export type AssetEntity = "tenants" | "flats" | "maintenance";
export type AssetCategory = "kyc" | "photos";

export interface StoredAsset {
  publicId: string;
  format: string;
}

const ROOT = config.isProduction ? "prod" : config.nodeEnv;

export const buildAssetPath = (params: {
  organizationId: string;
  entity: AssetEntity;
  entityId: string;
  category: AssetCategory;
  baseName: string;
  timestamp?: number;
}): string =>
  [
    ROOT,
    "orgs",
    params.organizationId,
    params.entity,
    params.entityId,
    params.category,
    `${params.baseName}_${params.timestamp ?? Date.now()}`,
  ].join("/");

/** Asset reference persisted (encrypted) on the owning record. */
export const serializeAsset = (asset: StoredAsset): string =>
  `cld:${asset.format}:${asset.publicId}`;

export const parseAsset = (
  value: string | null,
): StoredAsset | { legacyUrl: string } | null => {
  if (!value) return null;
  if (value.startsWith("cld:")) {
    const [, format, ...rest] = value.split(":");
    return { format: format ?? "jpg", publicId: rest.join(":") };
  }
  if (/^https?:\/\//.test(value)) return { legacyUrl: value };
  return null;
};

const ensureEnabled = () => {
  if (!config.cloudinary.enabled) {
    throw new ServiceUnavailableError("File storage is not configured");
  }
};

export const uploadPrivate = async (
  buffer: Buffer,
  publicId: string,
): Promise<StoredAsset> => {
  ensureEnabled();
  try {
    const result = await new Promise<UploadApiResponse>((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        {
          public_id: publicId,
          type: "authenticated",
          resource_type: "image",
          overwrite: false,
        },
        (error, res) => (error || !res ? reject(error) : resolve(res)),
      );
      stream.end(buffer);
    });
    return { publicId: result.public_id, format: result.format };
  } catch (err) {
    logger.error({ err }, "Cloudinary upload failed");
    throw new UpstreamError("File upload failed. Please try again.");
  }
};

/** Best-effort delete; used for compensation and replacing old files. */
export const deleteAsset = async (asset: StoredAsset): Promise<void> => {
  if (!config.cloudinary.enabled) return;
  try {
    await cloudinary.uploader.destroy(asset.publicId, {
      type: "authenticated",
      resource_type: "image",
      invalidate: true,
    });
  } catch (err) {
    logger.error({ err, publicId: asset.publicId }, "Cloudinary delete failed");
  }
};

/** Short-lived URL for a private asset (default 10 minutes). */
export const signedUrl = (asset: StoredAsset): string | null => {
  if (!config.cloudinary.enabled) return null;
  return cloudinary.utils.private_download_url(asset.publicId, asset.format, {
    type: "authenticated",
    resource_type: "image",
    expires_at:
      Math.floor(Date.now() / 1000) + config.cloudinary.signedUrlTtlSeconds,
  });
};

export const resolveAssetUrl = (value: string | null): string | null => {
  const parsed = parseAsset(value);
  if (!parsed) return null;
  return "legacyUrl" in parsed ? parsed.legacyUrl : signedUrl(parsed);
};

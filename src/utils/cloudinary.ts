const cloudinary = require("cloudinary").v2;

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

/**
 * Sanitizes a string for safe, recognizable Cloudinary folder names.
 */
export const sanitizeFolderName = (name: string, fallback = "item"): string => {
  if (!name || typeof name !== "string") return fallback;
  const sanitized = name
    .trim()
    .replace(/[^a-zA-Z0-9_\-\s]/g, "")
    .replace(/\s+/g, "_")
    .replace(/_+/g, "_")
    .slice(0, 40);
  return sanitized || fallback;
};

/**
 * Generates an intuitive, recognizable folder hierarchy in Cloudinary:
 * tenant-management/{orgName}_{orgId}/floor_{floorNum}/{tenantName}_{tenantId}/aadhar
 */
export const buildTenantFolderPath = (params: {
  orgName?: string;
  orgId: string;
  floor: number | string;
  tenantName?: string;
  tenantId: string;
  category?: string;
}): string => {
  const {
    orgName,
    orgId,
    floor,
    tenantName,
    tenantId,
    category = "aadhar",
  } = params;

  const cleanOrg = `${sanitizeFolderName(orgName || "Organization", "org")}_${orgId}`;
  const floorFolder = `floor_${floor}`;
  const cleanTenant = `${sanitizeFolderName(tenantName || "Tenant", "tenant")}_${tenantId}`;

  return `tenant-management/${cleanOrg}/${floorFolder}/${cleanTenant}/${category}`;
};

export const uploadImage = async (
  fileBuffer: any,
  folderPath = "tenant-management/aadhar",
) => {
  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder: folderPath,
      },
      (error: any, result: any) => {
        if (error) return reject(error);
        resolve(result);
      },
    );
    uploadStream.end(fileBuffer);
  });
};

module.exports = {
  cloudinary,
  uploadImage,
  sanitizeFolderName,
  buildTenantFolderPath,
};

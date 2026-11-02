import type { NextFunction, Request, Response } from "express";
import multer from "multer";
import { AppError, ErrorCode } from "../errors/AppError";
import { HttpStatus } from "../http/httpStatus";
import { getRequestContext, runWithContext } from "../requestContext";

export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

export type AllowedFileKind = "jpeg" | "png" | "webp" | "pdf";

/**
 * Detects the real file type from its magic bytes. The client-supplied
 * mimetype/extension are attacker-controlled and are not trusted.
 */
export const detectFileKind = (buf: Buffer): AllowedFileKind | null => {
  if (
    buf.length >= 3 &&
    buf[0] === 0xff &&
    buf[1] === 0xd8 &&
    buf[2] === 0xff
  ) {
    return "jpeg";
  }
  if (
    buf.length >= 8 &&
    buf
      .subarray(0, 8)
      .equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  ) {
    return "png";
  }
  if (
    buf.length >= 12 &&
    buf.subarray(0, 4).toString("ascii") === "RIFF" &&
    buf.subarray(8, 12).toString("ascii") === "WEBP"
  ) {
    return "webp";
  }
  if (buf.length >= 5 && buf.subarray(0, 5).toString("ascii") === "%PDF-") {
    return "pdf";
  }
  return null;
};

const memoryUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_UPLOAD_BYTES,
    files: 1,
    fields: 30,
    fieldSize: 64 * 1024,
  },
});

/**
 * Single-file multipart upload held in memory (streamed to object storage by
 * the service), followed by content sniffing against an allow-list.
 */
export const singleFile =
  (field: string, allowed: AllowedFileKind[] = ["jpeg", "png", "webp"]) =>
  (req: Request, res: Response, next: NextFunction) => {
    // Multer resumes on stream events, which run outside our
    // AsyncLocalStorage scope; re-enter it so logging/audit context survives.
    const ctx = getRequestContext();
    const resume = (err?: unknown) =>
      ctx ? runWithContext(ctx, () => next(err)) : next(err);
    memoryUpload.single(field)(req, res, (err: unknown) => {
      const next = resume;
      if (err instanceof multer.MulterError) {
        const tooLarge = err.code === "LIMIT_FILE_SIZE";
        return next(
          new AppError(
            tooLarge
              ? "File exceeds the 5 MB limit"
              : `Upload error: ${err.message}`,
            tooLarge ? HttpStatus.PAYLOAD_TOO_LARGE : HttpStatus.BAD_REQUEST,
            tooLarge ? ErrorCode.FILE_TOO_LARGE : ErrorCode.BAD_REQUEST,
          ),
        );
      }
      if (err) return next(err);
      if (req.file) {
        const kind = detectFileKind(req.file.buffer);
        if (!kind || !allowed.includes(kind)) {
          return next(
            new AppError(
              `Unsupported file type. Allowed: ${allowed.join(", ")}`,
              HttpStatus.UNSUPPORTED_MEDIA_TYPE,
              ErrorCode.UNSUPPORTED_FILE_TYPE,
            ),
          );
        }
      }
      next();
    });
  };

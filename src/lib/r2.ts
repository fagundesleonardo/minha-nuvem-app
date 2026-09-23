import { S3Client } from "@aws-sdk/client-s3";

/**
 * Cloudflare R2 client (S3-compatible API). Files never pass through our
 * Next.js server — the browser uploads/downloads directly against R2
 * using short-lived presigned URLs (see src/lib/upload.ts and the
 * "presign-upload" / "presign-download" route handlers). That's the fix for the old
 * Nextcloud setup's slow/broken uploads, which proxied every byte
 * through the VPS on the way to R2.
 */
export const r2 = new S3Client({
  region: "auto",
  endpoint: process.env.R2_ENDPOINT!,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
  },
});

export const R2_BUCKET = process.env.R2_BUCKET!;

/** Build a per-user, collision-proof object key for a new upload. */
export function makeR2Key(ownerId: string, fileId: string, filename: string) {
  const safeName = filename.replace(/[^\w.\-]+/g, "_").slice(-180);
  return `users/${ownerId}/${fileId}-${safeName}`;
}

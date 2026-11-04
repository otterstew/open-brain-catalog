// Photos inside notes (4 Nov 2026).
//
// A note holds a photo as Markdown, ![caption](photo:2026/11/<uuid>.jpg). The
// file sits in the private Storage bucket "note-photos"; nothing about it is
// public. The catalog uploads through POST /photos/upload and, to show photos,
// asks POST /photos/sign for links that expire after an hour. Both routes sit
// behind the archive key like everything else. Files are never deleted here:
// taking a photo out of a note's text leaves the file in place, so an edit
// cannot lose one for good.

export const PHOTO_BUCKET = "note-photos";
export const PHOTO_UPLOAD_MAX_BYTES = 6_000_000;   // the catalog resizes to ~0.5 MB first
export const PHOTO_SIGN_SECONDS = 3600;
export const PHOTO_SIGN_MAX = 60;

const PATH_RE = /^\d{4}\/\d{2}\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|webp|png)$/;
const DATA_URL_RE = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$/;

export function isPhotoPath(p: unknown): p is string {
  return typeof p === "string" && PATH_RE.test(p);
}

/** Where a new photo goes: year/month/uuid.ext, from the image type. */
export function newPhotoPath(mime: string, now = new Date(), id = crypto.randomUUID()): string {
  const ext = mime === "image/png" ? "png" : mime === "image/webp" ? "webp" : "jpg";
  const mm = String(now.getUTCMonth() + 1).padStart(2, "0");
  return `${now.getUTCFullYear()}/${mm}/${id}.${ext}`;
}

/** A data URL as bytes and type, or an error message for the person uploading. */
export function decodeImage(dataUrl: unknown): { bytes: Uint8Array; mime: string } | { error: string } {
  const m = typeof dataUrl === "string" ? dataUrl.match(DATA_URL_RE) : null;
  if (!m) return { error: "That is not a JPEG, PNG or WebP image." };
  const bin = atob(m[2]);
  if (bin.length > PHOTO_UPLOAD_MAX_BYTES) return { error: "That photo is too large." };
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return { bytes, mime: "image/" + m[1] };
}

/** The paths asked for, kept only when well formed, without repeats, capped. */
export function cleanPaths(paths: unknown): string[] {
  if (!Array.isArray(paths)) return [];
  return [...new Set(paths.filter(isPhotoPath))].slice(0, PHOTO_SIGN_MAX);
}

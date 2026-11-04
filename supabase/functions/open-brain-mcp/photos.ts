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

// Sound recordings inside notes (4 Nov 2026). Same shape as photos: a note
// holds [Recording · 0:42](audio:2026/11/<uuid>.webm), the file sits in the
// private bucket "note-audio", uploads go through POST /audio/upload and
// playing asks POST /audio/sign for links that expire after an hour. Voice
// notes and nature sounds alike; transcribing is a separate thing (Speak).
export const AUDIO_BUCKET = "note-audio";
export const AUDIO_UPLOAD_MAX_BYTES = 15_000_000;   // about 30 minutes of the catalog's recordings

const AUDIO_PATH_RE = /^\d{4}\/\d{2}\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(webm|ogg|m4a|mp3)$/;
const AUDIO_DATA_RE = /^data:audio\/(webm|ogg|mp4|mpeg)(?:;[a-z0-9=.,+-]+)*;base64,([A-Za-z0-9+/=]+)$/i;
const AUDIO_EXT: Record<string, string> = { webm: "webm", ogg: "ogg", mp4: "m4a", mpeg: "mp3" };

export function isAudioPath(p: unknown): p is string {
  return typeof p === "string" && AUDIO_PATH_RE.test(p);
}

/** Where a new recording goes: year/month/uuid.ext, from the sound's type. */
export function newAudioPath(mime: string, now = new Date(), id = crypto.randomUUID()): string {
  const ext = AUDIO_EXT[mime.replace(/^audio\//, "")] || "webm";
  const mm = String(now.getUTCMonth() + 1).padStart(2, "0");
  return `${now.getUTCFullYear()}/${mm}/${id}.${ext}`;
}

/** A data URL as bytes and a plain type (codecs dropped), or an error message. */
export function decodeAudio(dataUrl: unknown): { bytes: Uint8Array; mime: string } | { error: string } {
  const m = typeof dataUrl === "string" ? dataUrl.match(AUDIO_DATA_RE) : null;
  if (!m) return { error: "That is not a WebM, Ogg, MP4 or MP3 recording." };
  const bin = atob(m[2]);
  if (bin.length > AUDIO_UPLOAD_MAX_BYTES) return { error: "That recording is too long to keep." };
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return { bytes, mime: "audio/" + m[1].toLowerCase() };
}

/** The recording paths asked for, kept only when well formed, without repeats, capped. */
export function cleanAudioPaths(paths: unknown): string[] {
  if (!Array.isArray(paths)) return [];
  return [...new Set(paths.filter(isAudioPath))].slice(0, PHOTO_SIGN_MAX);
}

// Writing speech out (4 Nov 2026). The phone's own recogniser missed too many
// words, so Speak now records and sends the sound to NVIDIA's Parakeet v3
// through OpenRouter (the same account as the embeddings; about $0.001 a
// minute). The words come back as text; nothing is stored unless the note is
// saved. A recording already in the archive can be written out by its path.
export const TRANSCRIBE_MODEL = "nvidia/parakeet-tdt-0.6b-v3";
export const TRANSCRIBE_MAX_BYTES = 8_000_000;   // about 15 minutes of the catalog's speech

/** The format name OpenRouter wants, from a type or a file name. */
export function audioFormat(mimeOrPath: string): string {
  const s = mimeOrPath.toLowerCase().replace(/^audio\//, "").split(";")[0];
  const ext = s.includes(".") ? s.slice(s.lastIndexOf(".") + 1) : s;
  return ({ webm: "webm", ogg: "ogg", mp4: "m4a", m4a: "m4a", mpeg: "mp3", mp3: "mp3" } as Record<string, string>)[ext] || "webm";
}

/** Bytes as base64, in slices so a long recording does not overflow the stack. */
export function toBase64(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

/** Tidy what the model returns: one line of plain text, no doubled spaces. */
export function cleanTranscript(text: unknown): string {
  return typeof text === "string" ? text.replace(/\s+/g, " ").trim() : "";
}

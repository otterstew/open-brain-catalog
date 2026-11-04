// deno run --no-config supabase/functions/open-brain-mcp/tests/photos_test.ts
import { audioFormat, cleanAudioPaths, cleanPaths, cleanTranscript, decodeAudio, decodeImage, isAudioPath, isPhotoPath, newAudioPath, newPhotoPath, toBase64 } from "../photos.ts";

let failed = 0;
const check = (name: string, ok: boolean) => { if (!ok) { failed++; console.log("FAIL", name); } };

const id = "0f8b6c1e-2a3b-4c5d-8e9f-0a1b2c3d4e5f";
const p = newPhotoPath("image/jpeg", new Date("2026-11-04T10:00:00Z"), id);
check("path shape", p === `2026/11/${id}.jpg`);
check("png ext", newPhotoPath("image/png", new Date("2026-01-09T00:00:00Z"), id) === `2026/01/${id}.png`);
check("valid path", isPhotoPath(p));
check("no traversal", !isPhotoPath("../secret.jpg") && !isPhotoPath(`2026/11/../${id}.jpg`));
check("no other ext", !isPhotoPath(`2026/11/${id}.svg`));
check("clean dedupes and filters", JSON.stringify(cleanPaths([p, p, "x", 3])) === JSON.stringify([p]));
check("clean non-array", cleanPaths("nope").length === 0);
const tiny = "data:image/png;base64,iVBORw0KGgo=";
const d = decodeImage(tiny);
check("decode ok", "bytes" in d && d.mime === "image/png" && d.bytes[1] === 0x50);
check("reject svg", "error" in decodeImage("data:image/svg+xml;base64,PHN2Zz4="));
check("reject junk", "error" in decodeImage(42));

const a = newAudioPath("audio/webm", new Date("2026-11-04T10:00:00Z"), id);
check("audio path shape", a === `2026/11/${id}.webm`);
check("audio mp4 ext", newAudioPath("audio/mp4", new Date("2026-11-04T10:00:00Z"), id).endsWith(".m4a"));
check("audio valid", isAudioPath(a) && !isAudioPath(`2026/11/${id}.jpg`) && !isAudioPath("../x.webm"));
check("photo path is not audio", !isAudioPath(p) && !isPhotoPath(a));
const da = decodeAudio("data:audio/webm;codecs=opus;base64,GkXfow==");
check("decode audio with codecs", "bytes" in da && da.mime === "audio/webm" && da.bytes[0] === 0x1a);
check("reject image as audio", "error" in decodeAudio(tiny));
check("clean audio", JSON.stringify(cleanAudioPaths([a, a, p])) === JSON.stringify([a]));

check("format from type", audioFormat("audio/webm;codecs=opus") === "webm" && audioFormat("audio/mp4") === "m4a");
check("format from path", audioFormat(`2026/11/${id}.ogg`) === "ogg" && audioFormat("x.mp3") === "mp3");
check("base64 round trip", toBase64(new Uint8Array([1, 2, 3, 250])) === btoa(String.fromCharCode(1, 2, 3, 250)));
check("base64 long", atob(toBase64(new Uint8Array(100_000).fill(7))).length === 100_000);
check("clean transcript", cleanTranscript("  hello \n there  ") === "hello there" && cleanTranscript(null) === "");

console.log(failed ? `${failed} failed` : "photos: all passed");
if (failed) Deno.exit(1);

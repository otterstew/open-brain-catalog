// deno run --no-config supabase/functions/open-brain-mcp/tests/photos_test.ts
import { cleanPaths, decodeImage, isPhotoPath, newPhotoPath } from "../photos.ts";

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

console.log(failed ? `${failed} failed` : "photos: all passed");
if (failed) Deno.exit(1);

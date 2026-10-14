// Splitting a note into the pieces that get their own search embedding.
//
// The note-level embedding covers only the first 24,000 characters, and in
// August 2026 that left about a quarter of the archive's text unsearchable by
// meaning ("The Unembedded Quarter", 485beb5f). The fix is to embed a long note
// in overlapping pieces and let a search match its best piece. Pure: no
// network, no database.
//
// Parameters from that note: about 6,000 characters a piece, 600 of overlap,
// and a cut on a paragraph break when one falls within 10% of the target, so a
// piece reads as whole paragraphs rather than ending mid-sentence.

export const CHUNK_CHARS = 6000;
export const CHUNK_OVERLAP = 600;

export function chunkText(text: string, size = CHUNK_CHARS, overlap = CHUNK_OVERLAP): string[] {
  if (text.length <= size) return [text];
  const out: string[] = [];
  let start = 0;
  while (start < text.length) {
    let end = Math.min(start + size, text.length);
    if (end < text.length) {
      // The last paragraph break within 10% before the target, else the last
      // line break, else the last space, else a hard cut.
      const floor = end - Math.floor(size * 0.1);
      const window = text.slice(floor, end);
      const para = window.lastIndexOf("\n\n");
      const line = window.lastIndexOf("\n");
      const space = window.lastIndexOf(" ");
      const cut = para >= 0 ? para + 2 : line >= 0 ? line + 1 : space >= 0 ? space + 1 : -1;
      if (cut > 0) end = floor + cut;
    }
    out.push(text.slice(start, end));
    if (end >= text.length) break;
    // Step back by the overlap so a passage straddling a cut is whole in one
    // of the two pieces; never step back to or before this piece's start.
    start = Math.max(end - overlap, start + 1);
  }
  return out;
}

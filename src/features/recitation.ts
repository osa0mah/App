export function normalizeArabic(text: string): string {
  return text
    .normalize("NFKC")
    .replace(/[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06ED\u0640]/g, "")
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/[^\u0621-\u063A\u0641-\u064A\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
export function advanceRecitation(
  expected: string[],
  cursor: number,
  transcript: string,
): number {
  const spoken = normalizeArabic(transcript).split(" ").filter(Boolean);
  if (!spoken.length) return cursor;
  // Accept a fresh segment or a repeated prefix, never skip an unmatched word.
  for (let start = cursor; start >= 0; start--) {
    if (start + spoken.length <= cursor) continue;
    if (spoken.every((word, i) => expected[start + i] === word))
      return Math.max(cursor, start + spoken.length);
  }
  // Reveal the verified prefix even if a later word in the segment is wrong.
  let matched = 0;
  while (
    matched < spoken.length &&
    expected[cursor + matched] === spoken[matched]
  )
    matched++;
  return cursor + matched;
}

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
export type RecitationProgress = { verse: number; pending: string[] };

// Pending words stay hidden. Only an exact, complete next verse is committed.
export function matchRecitation(
  verses: string[][],
  progress: RecitationProgress,
  transcript: string,
): RecitationProgress {
  const spoken = normalizeArabic(transcript).split(" ").filter(Boolean);
  if (!spoken.length || progress.verse >= verses.length) return progress;
  const tokens = [...progress.pending, ...spoken];
  let verse = progress.verse;
  let offset = 0;
  while (verse < verses.length) {
    const expected = verses[verse];
    let found = -1;
    for (let start = offset; start + expected.length <= tokens.length; start++) {
      if (expected.every((word, i) => tokens[start + i] === word)) {
        found = start;
        break;
      }
    }
    if (found < 0) {
      // A correction may begin in the same result after an incorrect passage.
      // Keep only a suffix that can still become the required verse.
      for (let size = Math.min(expected.length - 1, tokens.length - offset); size > 0; size--) {
        const tail = tokens.slice(-size);
        if (tail.every((word, i) => word === expected[i])) return { verse, pending: tail };
      }
      return { verse, pending: [] };
    }
    offset = found + expected.length;
    verse++;
  }
  return { verse, pending: [] };
}

// Accept the next words or a repeated prefix, stopping at the first mismatch.
export function matchRecitationWords(
  expected: string[], cursor: number, transcript: string,
): number {
  const spoken = normalizeArabic(transcript).split(" ").filter(Boolean);
  let next = cursor;
  for (let start = cursor; start >= 0; start--) {
    let matched = 0;
    while (matched < spoken.length && expected[start + matched] === spoken[matched]) matched++;
    if (start + matched > next) next = start + matched;
  }
  return Math.min(next, expected.length);
}

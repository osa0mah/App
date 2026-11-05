import layout from "../../data/quran/page-layout.json" with { type: "json" };
import quran from "../../data/chapters.json" with { type: "json" };
export const mushafPages = layout.pages;
export const mushafChapters = layout.chapters;
export const mushafJuz = layout.juz;
export const mushafLayoutSource = layout.source;
export const mushafPageCount = mushafPages.length;
export type MushafVerse = { chapter: number; verse: number; text: string };
export type MushafSection = { chapter: number; name: string; showHeading: boolean; bismillah: string; verses: MushafVerse[] };
const verseEntries: MushafVerse[] = quran.chapters.flatMap(chapter => chapter.verses.map((text, index) => ({ chapter: chapter.id, verse: index+1, text })));
const offsets = new Map<number, number>();
let offset = 0;
for (const chapter of quran.chapters) { offsets.set(chapter.id, offset); offset += chapter.verses.length; }
export function pageForVerse(chapter: number, verse = 1): number {
  const source = quran.chapters.find(item => item.id === chapter);
  if (!source || !Number.isInteger(verse) || verse < 1 || verse > source.verses.length) throw new RangeError("Invalid Quran verse");
  const absolute = offsets.get(chapter)!+verse;
  return mushafPages.find(page => page.start <= absolute && page.end >= absolute)!.number;
}
export function pageSections(number: number): MushafSection[] {
  const page = mushafPages[number-1];
  if (!Number.isInteger(number) || !page) throw new RangeError("Invalid mushaf page");
  const sections: MushafSection[] = [];
  for (const entry of verseEntries.slice(page.start-1, page.end)) {
    let section = sections.at(-1);
    if (!section || section.chapter !== entry.chapter) {
      const chapter = quran.chapters.find(item => item.id === entry.chapter)!;
      section = { chapter: entry.chapter, name: chapter.name, showHeading: entry.verse === 1, bismillah: entry.verse === 1 ? chapter.bismillah : "", verses: [] };
      sections.push(section);
    }
    section.verses.push(entry);
  }
  return sections;
}
export const boundedPage = (number: number) => Math.max(1, Math.min(mushafPageCount, number));
export function swipePageDelta(dx: number, dy: number): number {
  if (Math.abs(dx) < 56 || Math.abs(dx) < Math.abs(dy)*1.5) return 0;
  // Arabic mushaf: drag right to advance, left to go back.
  return dx > 0 ? 1 : -1;
}
export const parsePageNumber = (input: string): number | null => {
  const digits = input.trim().replace(/[٠-٩۰-۹]/g, digit => String("٠١٢٣٤٥٦٧٨٩".includes(digit) ? "٠١٢٣٤٥٦٧٨٩".indexOf(digit) : "۰۱۲۳۴۵۶۷۸۹".indexOf(digit)));
  const number = Number(digits);
  return /^\d+$/.test(digits) && Number.isInteger(number) && number >= 1 && number <= mushafPageCount ? number : null;
};

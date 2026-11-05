import catalog from "../data/learning/mokhtasar.json";
export const learningSource = catalog.source;
export const learningChapters = catalog.chapters;
export type LearningChapter = (typeof learningChapters)[number];
export type LearningPage = (typeof catalog.pages)[number];
const pages = new Map(catalog.pages.map(page => [page.page, page]));
export const learningPages = (chapter: LearningChapter): LearningPage[] =>
  chapter.pageNumbers.map(number => pages.get(number)!);
export const learningChapterNames = (ids: number[]) => ids.map(id => learningChapters.find(c => c.id === id)!.name).join("، ");
export const normalizeChapterSearch = (value: string) => value
  .normalize("NFKD").replace(/[\u064b-\u065f\u0670\u0640]/g, "")
  .replace(/[أإآ]/g, "ا").replace(/ى/g, "ي").replace(/ة/g, "ه")
  .replace(/[٠-٩]/g, digit => String("٠١٢٣٤٥٦٧٨٩".indexOf(digit)))
  .replace(/[۰-۹]/g, digit => String("۰۱۲۳۴۵۶۷۸۹".indexOf(digit)))
  .trim().replace(/^(?:سوره|السوره)\s+/, "");

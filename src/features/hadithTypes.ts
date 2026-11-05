export type HadithFilter = "all" | "albani" | "muttafaq" | "sahihayn";
export type HadithSummary = {
  id: string; collection: string; collectionTitle: string; number: string; numberLabel: string;
  title: string; excerpt: string; grade: string; gradedBy: string; muttafaq: boolean;
  qualification: string; sourceName: string; sourceVersion: string; sourceUrl: string; hasExplanation: boolean;
};
export type HadithDetail = HadithSummary & {
  text: string; attribution: string; explanation: string; benefits: string; wordMeanings: string;
  gradeOriginal: string; otherGrades: { name: string; grade: string; originalName: string; originalGrade: string }[];
  sourceNotice: string;
};
export type HadithSearch = {
  stats: { total: number; albani: number; muttafaq: number; sahihayn: number };
  collections: { id: string; title: string; accepted: number }[];
  sources: { id: string; title: string; version: string; url: string; notice: string }[];
  retrievedAt: string; total: number; page: number; pages: number; items: HadithSummary[];
};

import records from "../../data/fatwas.json";
import { normalizeArabic } from "./recitation";
export type Fatwa = {
  id: string;
  scholar: string;
  title: string;
  question: string;
  answer: string;
  sourceUrl: string;
  retrievedAt: string;
  audioUrl?: string;
  archiveUrl?: string;
  archivedAt?: string;
  audioArchivedAt?: string;
};
export const fatwas: Fatwa[] = records;
export function searchFatwas(
  index: Fatwa[],
  scholar: string,
  query: string,
): Fatwa[] {
  const terms = normalizeArabic(query).split(" ").filter(Boolean);
  return index.filter(
    (f) =>
      f.scholar === scholar &&
      terms.every((t) =>
        normalizeArabic(`${f.title} ${f.question} ${f.answer}`).includes(t),
      ),
  );
}

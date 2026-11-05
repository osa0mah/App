import saadi from "../data/tafsir/saadi.json";
import muyassar from "../data/tafsir/muyassar.json";
import introductions from "../data/learning/introductions.json";
export const muyassarSource = muyassar;
const saadiIndex = new Map(saadi.ayahs.map(entry => [`${entry.surah}:${entry.ayah}`, entry]));
const muyassarIndex = new Map(muyassar.ayahs.map(entry => [`${entry.surah}:${entry.ayah}`, entry]));
export const verseTafsir = (chapter: number, verse: number) => {
  const key = `${chapter}:${verse}`;
  const preferred = saadiIndex.get(key);
  const entry = preferred || muyassarIndex.get(key);
  return { entry: entry && !preferred && verse === 1 ? { ...entry, text: surahIntroduction(chapter).firstVerseTafsir } : entry, source: preferred ? saadi : muyassar };
};
export const surahIntroduction = (chapter: number) => introductions.chapters.find(item => item.id === chapter)!;
export const muyassarVerse = (chapter: number, verse: number) => {
  if (verse === 1) return surahIntroduction(chapter).firstVerseTafsir;
  return muyassarIndex.get(`${chapter}:${verse}`)?.text || "";
};
export const revelationNotes = (chapter: number) => muyassar.ayahs
  .filter(entry => entry.surah === chapter)
  .map(entry => ({ verse: entry.ayah, text: muyassarVerse(chapter, entry.ayah) }))
  .filter(entry => /سبب نزول|نزلت هذه الآية|نزلت هذه الآيات|نزلت الآية|نزلت الآيات|نزلت في/.test(entry.text));

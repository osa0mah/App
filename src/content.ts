import data from "../data/chapters.json" with { type: "json" };
export type Surah = {
  id: number;
  name: string;
  place: string;
  bismillah: string;
  verses: string[];
  recitationVerses: string[];
};
export const surahs: Surah[] = data.chapters;
export const quranSource = data.source;
export const scholars = [
  { name: "عبد العزيز بن باز", url: "https://binbaz.org.sa/" },
  { name: "صالح الفوزان", url: "https://www.alfawzan.af.org.sa/" },
  { name: "محمد بن صالح العثيمين", url: "https://binothaimeen.net/" },
];

import chapters from "../data/chapters.json" with { type: "json" };
export type Surah = {
  id: number;
  name: string;
  place: string;
  theme: string;
  lessons: string[];
  verses: string[];
};
export const surahs: Surah[] = chapters;
export const scholars = [
  { name: "عبد العزيز بن باز", url: "https://binbaz.org.sa/" },
  { name: "صالح الفوزان", url: "https://www.alfawzan.af.org.sa/" },
  { name: "محمد بن صالح العثيمين", url: "https://binothaimeen.net/" },
];

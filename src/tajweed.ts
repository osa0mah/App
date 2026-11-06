import curriculum from "../data/tajweed/lessons.json" with { type: "json" };
import media from "../data/tajweed/media.json" with { type: "json" };
import quran from "../data/chapters.json" with { type: "json" };
export const tajweedLessons = curriculum.lessons;
export const tajweedGroups = curriculum.groups;
export const tajweedReferences = curriculum.references;
export const tajweedRiwaya = curriculum.riwaya;
export const tajweedEditorialNote = curriculum.editorialNote;
export const tajweedTeachers = media.teachers;
export type TajweedLesson = typeof tajweedLessons[number];
export type TajweedExample = TajweedLesson["examples"][number];
export type TajweedClip = typeof media.clips[number];
export type TajweedTeacher = "ayman" | "fares";
export const lessonClips = (lesson: TajweedLesson, teacher: TajweedTeacher): TajweedClip[] => lesson.media[teacher].map(id => media.clips.find(clip => clip.id === id)!);
export function tajweedExample(example: TajweedExample) {
  const chapter = quran.chapters[example.chapter-1];
  const text = chapter.verses[example.verse-1];
  const words = [...text.matchAll(/\S+/g)];
  const first = words[example.firstWord-1].index!;
  const last = words[example.lastWord-1];
  const end = last.index!+last[0].length;
  return { name: chapter.name, text, before: text.slice(0, first), focus: text.slice(first, end), after: text.slice(end) };
}

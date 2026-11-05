import data from '../data/chapters.json' with {type:'json'};
import {normalizeSearch} from './searchText.mjs';
export const chapters=data.chapters;
const names=chapters.map(chapter=>({chapter,name:normalizeSearch(chapter.name)})).sort((a,b)=>b.name.length-a.name.length);
export function findChapter(text){
  const normal=normalizeSearch(text);
  const numeric=normal.match(/(?:^|\s)(?:سوره|السوره)\s+(\d+)(?:\s|$)/);
  if(numeric)return chapters.find(c=>c.id===Number(numeric[1])) || null;
  return names.find(({name})=>new RegExp(`(?:^|\\s)(?:و)?${name}(?:\\s|$)`).test(normal))?.chapter || null;
}

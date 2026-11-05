// Page/Juz metadata only: Quran verse text stays untouched in its separately verified source.
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import quran from '../data/chapters.json' with {type:'json'};
const sourceUrl='https://quranenc.com/assets_2/js/quran-data.js';
const input=process.argv[2];
const text=input?await readFile(input,'utf8'):await (async()=>{const response=await fetch(sourceUrl,{signal:AbortSignal.timeout(30000)});if(!response.ok)throw Error(`HTTP ${response.status}`);return response.text();})();
if(!text.includes('Quran Metadata (ver 1.0)')||!text.includes('Creative Commons Attribution 3.0'))throw Error('Review changed metadata source and license');
function pairs(name){const block=text.split(`QuranData.${name} = [`)[1]?.split('];')[0];if(!block)throw Error(`Missing ${name}`);return [...block.matchAll(/\[(\d+),\s*(\d+)\]/g)].map(match=>({chapter:Number(match[1]),verse:Number(match[2])}));}
const pageStarts=pairs('Page');const juzStarts=pairs('Juz');
if(pageStarts.length!==605||juzStarts.length!==31||pageStarts.at(-1).chapter!==115||juzStarts.at(-1).chapter!==115)throw Error('Incomplete page or juz data');
let count=0;const offsets=new Map(quran.chapters.map(chapter=>{const start=count;count+=chapter.verses.length;return[chapter.id,start];}));
function absolute({chapter,verse}){if(chapter===115&&verse===1)return count+1;const source=quran.chapters.find(c=>c.id===chapter);if(!source||!Number.isInteger(verse)||verse<1||verse>source.verses.length)throw Error('Invalid verse boundary');return offsets.get(chapter)+verse;}
const pages=pageStarts.slice(0,604).map((start,index)=>{const first=absolute(start),last=absolute(pageStarts[index+1])-1;if(last<first)throw Error('Non-monotonic pages');return{number:index+1,start:first,end:last,firstChapter:start.chapter,firstVerse:start.verse,juz:juzStarts.findLastIndex(juz=>absolute(juz)<=first)+1,endJuz:juzStarts.findLastIndex(juz=>absolute(juz)<=last)+1};});
const pageFor=location=>{const verse=absolute(location);return pages.find(page=>page.start<=verse&&page.end>=verse)?.number;};
const chapters=quran.chapters.map(chapter=>({id:chapter.id,firstPage:pageFor({chapter:chapter.id,verse:1}),lastPage:pageFor({chapter:chapter.id,verse:chapter.verses.length})}));
const juz=juzStarts.slice(0,30).map((start,index)=>({number:index+1,page:pageFor(start),chapter:start.chapter,verse:start.verse}));
if(pages[0].start!==1||pages.at(-1).end!==6236||pages.some((page,index)=>index&&page.start!==pages[index-1].end+1))throw Error('Incomplete Quran coverage');
const source={title:'Tanzil Quran Metadata',version:'1.0',author:'Tanzil.info',copyright:'Copyright (C) 2008-2009 Tanzil.info',license:'Creative Commons Attribution 3.0',licenseUrl:'https://creativecommons.org/licenses/by/3.0/',url:sourceUrl,sha256:createHash('sha256').update(text).digest('hex'),retrievedAt:new Date().toISOString()};
await writeFile(new URL('../data/quran/page-layout.json',import.meta.url),JSON.stringify({source,pages,chapters,juz},null,2)+'\n');
console.log(`Verified layout: ${pages.length} pages, ${chapters.length} surahs, ${juz.length} juz, ${count} verses.`);

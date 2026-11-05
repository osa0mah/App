// Explicit maintenance import: keep the Quran text verbatim and validate before writing.
import { load } from 'cheerio';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import learning from '../data/learning/mokhtasar.json' with {type:'json'};
const root=fileURLToPath(new URL('../',import.meta.url));
const cache=process.env.ATHAR_QURAN_CACHE || path.join(tmpdir(),'athar-quran-source');
await mkdir(cache,{recursive:true});
const refresh=process.argv.includes('--refresh');
const receipts=[];
async function get(url){
  const file=path.join(cache,createHash('sha256').update(url).digest('hex'));
  let body;
  if(!refresh)try{body=await readFile(file,'utf8');}catch{}
  if(!body)for(let attempt=0;attempt<3;attempt++){
    try{const r=await fetch(url,{signal:AbortSignal.timeout(45000)});if(!r.ok)throw Error(`${r.status}: ${url}`);body=await r.text();await writeFile(file,body);break;}
    catch(e){if(attempt===2)throw e;await new Promise(resolve=>setTimeout(resolve,1000*(attempt+1)));}
  }
  receipts.push({url,sha256:createHash('sha256').update(body).digest('hex')});return body;
}
const quranUrl='https://tanzil.net/pub/download/index.php?quranType=uthmani&outType=xml';
const xml=await get(quranUrl);
const copyright=xml.match(/<!--([\s\S]*?)-->/)?.[1]?.trim();
if(!copyright?.includes('Uthmani, Version 1.1') || !copyright.includes('CHANGING IT IS NOT ALLOWED'))throw Error('Review changed Quran text edition and terms');
const $=load(xml,{xmlMode:true});
const chapters=$('sura').map((index,element)=>{
  const id=Number($(element).attr('index'));
  const meta=learning.chapters.find(c=>c.id===id);
  const ayahs=$(element).find('aya');
  if(!meta || id!==index+1 || ayahs.length!==meta.verseCount)throw Error(`Invalid Quran chapter ${id}`);
  const verses=ayahs.map((i,e)=>{if(Number($(e).attr('index'))!==i+1)throw Error('Verse sequence');const text=$(e).attr('text');if(!text?.trim())throw Error('Empty verse');return text;}).get();
  return {id,name:$(element).attr('name'),place:meta.place,bismillah:ayahs.first().attr('bismillah') || '',verses};
}).get();
if(chapters.length!==114 || chapters.reduce((sum,c)=>sum+c.verses.length,0)!==6236)throw Error('Incomplete Quran');
// A separate verbatim simple-script edition keeps speech matching independent of Uthmani spelling.
const simpleUrl='https://tanzil.net/pub/download/index.php?quranType=simple&outType=xml';
const simpleXml=await get(simpleUrl);const simpleCopyright=simpleXml.match(/<!--([\s\S]*?)-->/)?.[1]?.trim();
if(!simpleCopyright?.includes('Version 1.1')||!simpleCopyright.includes('CHANGING IT IS NOT ALLOWED'))throw Error('Review simple-script edition');
const simple=load(simpleXml,{xmlMode:true});
if(simple('sura').length!==114)throw Error('Incomplete simple script');
for(const chapter of chapters){const rows=simple(`sura[index="${chapter.id}"] aya`);if(rows.length!==chapter.verses.length)throw Error('Simple script verse count');chapter.recitationVerses=rows.map((i,e)=>{if(Number(simple(e).attr('index'))!==i+1)throw Error('Simple script sequence');return simple(e).attr('text');}).get();}
const ayahs=new Array(114);let cursor=0,done=0;
const sourceBase='https://raw.githubusercontent.com/spa5k/tafsir_api/v1.2.1/tafsir/ar-tafsir-muyassar';
await Promise.all(Array.from({length:3},async()=>{while(cursor<114){const index=cursor++;const chapter=chapters[index];const body=await get(`${sourceBase}/${chapter.id}.json`);const rows=JSON.parse(body);
 if(!Array.isArray(rows)||rows.length!==chapter.verses.length)throw Error(`Incomplete tafsir ${chapter.id}`);
 for(const [i,row] of rows.entries())if(row.surah!==chapter.id||row.ayah!==i+1||typeof row.text!=='string'||!row.text.trim())throw Error(`Invalid tafsir ${chapter.id}:${i+1}`);
 ayahs[index]=rows;if(++done%15===0)console.log(`Tafsir chapters: ${done}/114`);
}}));
const license=await get('https://raw.githubusercontent.com/spa5k/tafsir_api/v1.2.1/LICENSE');
if(!license.startsWith('MIT License'))throw Error('Review changed dataset license');
const retrievedAt=new Date().toISOString();
const source={recitationEdition:{edition:'Simple',url:'https://tanzil.net',downloadUrl:simpleUrl,version:'1.1',copyrightNotice:simpleCopyright,sha256:createHash('sha256').update(simpleXml).digest('hex')},title:'Tanzil Quran Text',edition:'Uthmani',version:'1.1',url:'https://tanzil.net',downloadUrl:quranUrl,license:'CC BY 3.0',licenseUrl:'https://creativecommons.org/licenses/by/3.0/',copyrightNotice:copyright,retrievedAt,sha256:createHash('sha256').update(xml).digest('hex')};
const tafsir={edition:'التفسير الميسر',editionSlug:'ar-tafsir-muyassar',version:'v1.2.1',datasetSource:'https://github.com/spa5k/tafsir_api/tree/v1.2.1',upstreamSource:'https://github.com/spa5k/tafsir_api/tree/v1.2.1/tafsir/ar-tafsir-muyassar',license:'MIT',licenseNotice:license,retrievedAt,ayahs:ayahs.flat()};
const introductions=tafsir.ayahs.filter(entry=>entry.ayah===1).map(entry=>{
 const hasMarker=entry.text.includes('[التفسير]');
 let introduction,firstVerseTafsir;
 if(hasMarker){[introduction,firstVerseTafsir]=entry.text.split('[التفسير]');}
 else {
  // The Ma'idah introduction omits the separator; its final unbulleted paragraph is the verse commentary.
  const paragraphs=entry.text.split(/\n\s*\n/);const index=paragraphs.findIndex((p,i)=>i>paragraphs.indexOf('من مقاصد السورة')&&!p.startsWith('•')&&p.trim());
  if(index<0)throw Error(`Missing first-verse commentary ${entry.surah}`);
  introduction=paragraphs.slice(0,index).join('\n\n');firstVerseTafsir=paragraphs.slice(index).join('\n\n');
 }
 const naming=introduction.split('تسمية السورة')[1]?.split('من مقاصد السورة')[0]?.trim();
 const purposes=(introduction.split('من مقاصد السورة')[1]||'').split(/\n\s*\n/).map(p=>p.trim()).filter(Boolean);
 if(!naming||!purposes.length||purposes.some(p=>!p.startsWith('•'))||!firstVerseTafsir?.trim())throw Error(`Invalid introduction ${entry.surah}`);
 return {id:entry.surah,naming,purposes,firstVerseTafsir:firstVerseTafsir.trim()};
});
const {ayahs:_ayahs,...introductionSource}=tafsir;
await writeFile(path.join(root,'data/learning/introductions.json'),JSON.stringify({source:introductionSource,chapters:introductions},null,2)+'\n');
await mkdir(path.join(root,'data/quran'),{recursive:true});
await writeFile(path.join(root,'data/quran/tanzil-uthmani.xml'),xml);
await writeFile(path.join(root,'data/quran/tanzil-simple.xml'),simpleXml);
await writeFile(path.join(root,'data/chapters.json'),JSON.stringify({source,chapters},null,2)+'\n');
await writeFile(path.join(root,'data/tafsir/muyassar.json'),JSON.stringify(tafsir,null,2)+'\n');
await writeFile(path.join(root,'data/quran/import-manifest.json'),JSON.stringify({retrievedAt,documents:receipts.sort((a,b)=>a.url.localeCompare(b.url))},null,2)+'\n');
console.log(`Complete: ${chapters.length} surahs, 6236 original verses, ${tafsir.ayahs.length} sourced tafsir entries.`);

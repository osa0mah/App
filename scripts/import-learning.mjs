// Explicit, resumable maintenance import. Never runs during startup or a build.
import { load } from 'cheerio';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
const cache = process.env.ATHAR_LEARNING_CACHE || path.join(tmpdir(), 'athar-learning-source');
const base = 'https://quranenc.com';
await mkdir(cache, { recursive: true });
const receipts = new Map();
const refresh = process.argv.includes("--refresh");
async function get(url) {
  const key = createHash('sha256').update(url).digest('hex');
  const file = path.join(cache, key + '.html');
  let body;
  if (!refresh) { try { body = await readFile(file, 'utf8'); } catch {} }
  if (!body) {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const response = await fetch(url, { signal: AbortSignal.timeout(45000), headers: { 'User-Agent': 'AtharQuranLearningImport/1.0' } });
        if (!response.ok) throw Error(`${response.status} ${url}`);
        body = await response.text();
        if (body.length < 20 || /Just a moment|Access denied/i.test(body.slice(0,1000))) throw Error(`Invalid response ${url}`);
        await writeFile(file, body);
        break;
      } catch (error) { if (attempt === 2) throw error; await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1))); }
    }
    await new Promise(resolve => setTimeout(resolve, 150));
  }
  receipts.set(url, createHash('sha256').update(body).digest('hex'));
  return body;
}
async function pool(items, work) {
  let cursor = 0;
  await Promise.all(Array.from({length:3}, async () => { while (cursor < items.length) { const item = items[cursor++]; await work(item); } }));
}
const robots = await get(base + '/robots.txt');
if (!robots.includes('Disallow: /*ajax') || /Disallow:\s*\/(?:\s|$)/.test(robots)) throw Error('Review changed robots policy before importing');
const home = load(await get(base + '/ar/home'));
const card = home('a[href="https://quranenc.com/ar/browse/arabic_mokhtasar"]').first().closest('.tab_card');
const sourceHeader = card.find('.tab_card_header').text();
const sourceVersion = sourceHeader.match(/V([\d.]+)/)?.[1];
const sourceDate = sourceHeader.match(/(\d{2})\/(\d{2})\/(\d{4})/);
if (!sourceDate) throw Error('Missing source update date');
if (!sourceVersion) throw Error('Missing source edition');
const metaBody = await get(base + '/assets_2/js/quran-data.js');
const suraBlock = metaBody.split('QuranData.Sura = [')[1]?.split('];')[0];
const pageBlock = metaBody.split('QuranData.Page = [')[1]?.split('];')[0];
const suraRows = [...suraBlock.matchAll(/^\s*\[(\d+),\s*(\d+),\s*\d+,\s*\d+,\s*'([^']+)'[^\n]*'(Meccan|Medinan)'\],?/gm)].slice(0,114);
const pageRows = [...pageBlock.matchAll(/\[(\d+),\s*(\d+)\]/g)].map(m => [Number(m[1]), Number(m[2])]);
if (suraRows.length !== 114 || pageRows.length !== 605) throw Error('Unexpected Quran metadata');
const metadata = suraRows.map((m, i) => ({ id:i+1, name:m[3], verseCount:Number(m[2]), start:Number(m[1]), place:m[4] === 'Meccan' ? 'مكية' : 'مدنية' }));
const pageStart = ([surah,ayah]) => surah === 115 ? 6237 : metadata[surah-1].start + ayah;
const pageRanges = pageRows.slice(0,604).map((value,index) => ({page:index+1,start:pageStart(value),end:pageStart(pageRows[index+1])-1}));
for (const chapter of metadata) {
  const pages = pageRanges.filter(p => p.start <= chapter.start+chapter.verseCount && p.end > chapter.start);
  chapter.firstPage = pages[0].page; chapter.lastPage = pages.at(-1).page;
}
const pageDifferences = [];
const chapters = new Array(114); const pages = new Map(); const pending = new Map();
function benefits($) {
  return $('.note_mokhtasar[data-det*="/fawaed/"]').map((i,e) => ({ id:$(e).attr('data-det'), text:$(e).parent().find('span').first().text().trim() })).get();
}
function recordPage(number, extracted, url) {
  const sourceUrl = url.replace(/_$/, '');
  const existing = pages.get(number);
  if (existing && JSON.stringify(existing.benefits) !== JSON.stringify(extracted)) throw Error(`Inconsistent shared-page benefits ${number}: ${sourceUrl}`);
  if (!existing || sourceUrl.localeCompare(existing.sourceUrl, 'en', {numeric:true}) < 0) pages.set(number, {page:number,benefits:extracted,sourceUrl});
}
let count=0;
await pool(metadata, async meta => {
  const url = `${base}/ar/browse/arabic_mokhtasar/${meta.id}`;
  const $ = load(await get(url));
  const purposes = $('.note_mokhtasar[data-det*="/maqased/"]').map((i,e) => $(e).parent().find('span').first().text().trim()).get();
  if (!purposes.length || purposes.some(x => !x)) throw Error(`No purposes: ${url}`);
  const labels = $('label.page').map((i,e) => ({page:Number($(e).attr('id')?.replace('page_','')),local:Number($(e).attr('data-page'))})).get();
  if (!labels.length || labels.some((label, index) => !Number.isInteger(label.page) || label.page < 1 || label.page > 604 || label.local !== index+1)) throw Error(`Invalid source page labels ${url}`);
  if (labels.length !== meta.lastPage-meta.firstPage+1 || labels[0].page !== meta.firstPage) pageDifferences.push({chapter:meta.id,sourcePages:labels.map(l=>l.page),metadataRange:[meta.firstPage,meta.lastPage]});
  const first = labels[0];
  const extracted = benefits($);
  if (!extracted.length) throw Error(`Missing first-page benefits ${url}`);
  recordPage(first.page, extracted, url);
  chapters[meta.id-1] = {id:meta.id,name:meta.name,verseCount:meta.verseCount,place:meta.place,purposes,pageNumbers:labels.map(l=>l.page),sourceUrl:url};
  for (const label of labels.slice(1)) { const pageUrl=`${base}/ar/browse/arabic_mokhtasar/${meta.id}-${label.local}_`; pending.set(pageUrl, {page:label.page,url:pageUrl}); }
  if (++count % 15 === 0) console.log(`Surah purposes: ${count}/114`);
});
count=0;
const missing = [...pending.values()];
console.log(`All 114 purposes read; importing ${missing.length} further benefit pages.`);
await pool(missing, async item => {
  const $=load(await get(item.url)); const extracted=benefits($);
  if (!extracted.length) throw Error(`Missing benefits ${item.url}`);
  recordPage(item.page, extracted, item.url);
  if (++count % 30 === 0) console.log(`Further pages: ${count}/${missing.length}`);
});
if (pages.size !== 604) throw Error(`Incomplete pages ${pages.size}`);
for (const page of pages.values()) {
  page.chapters = chapters.filter(c => c.pageNumbers.includes(page.page)).map(c=>c.id);
  if (!page.chapters.length) throw Error(`Orphan page ${page.page}`);
}
const source = {title:'المختصر في تفسير القرآن الكريم',publisher:'مركز تفسير للدراسات القرآنية',host:'QuranEnc.com',url:base+'/ar/browse/arabic_mokhtasar',version:sourceVersion,sourceUpdatedAt:`${sourceDate[3]}-${sourceDate[2]}-${sourceDate[1]}`,retrievedAt:new Date().toISOString(),termsUrl:base+'/ar/home#terms_modal',scope:'جميع نصوص «من مقاصد السورة» للسور الـ١١٤ وفوائد الآيات في صفحات المصدر الـ٦٠٤؛ ليست حصرًا لكل ما استنبطه المفسرون.',sharedPageNotice:'فوائد الصفحة قد تتناول أكثر من سورة عندما تشترك السور في الصفحة؛ تُعرض أسماء السور المشاركة دون نسبة كل فائدة لسورة بعينها.',metadataSource:{url:base+'/assets_2/js/quran-data.js',author:'Tanzil.info',version:'1.0',license:'CC BY 3.0',licenseUrl:'https://creativecommons.org/licenses/by/3.0/'}};
await mkdir(path.join(root,'data/learning'),{recursive:true});
await writeFile(path.join(root,'data/learning/mokhtasar.json'),JSON.stringify({schemaVersion:1,source,chapters,pages:[...pages.values()].sort((a,b)=>a.page-b.page)},null,2)+'\n');
await writeFile(path.join(root,'data/learning/import-manifest.json'),JSON.stringify({sourceVersion,retrievedAt:source.retrievedAt,pageDifferences,documents:[...receipts].sort(([a],[b])=>a.localeCompare(b)).map(([url,sha256])=>({url,sha256}))},null,2)+'\n');
console.log(`Complete: ${chapters.length} surahs; ${pages.size} pages; ${[...pages.values()].reduce((sum,p)=>sum+p.benefits.length,0)} benefits.`);

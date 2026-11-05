// Maintenance import, never run during application startup. Full source records stay unchanged.
import {createHash} from 'node:crypto';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {gzipSync} from 'node:zlib';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {albaniGrades,encGrades,qualifyingAlbani,collectionTitles,parseHadithCsv} from '../server/hadithPolicy.mjs';
const root=fileURLToPath(new URL('../',import.meta.url));
const commit='df57907be35291c91ad6a6691180e22ca9920784';
const base=`https://raw.githubusercontent.com/fawazahmed0/hadith-api/${commit}`;
const cache=process.env.ATHAR_HADITH_CACHE||path.join(tmpdir(),'athar-hadith-import');
await mkdir(cache,{recursive:true});
const refresh=process.argv.includes('--refresh');const receipts=[];
async function get(url){
 const file=path.join(cache,createHash('sha256').update(url).digest('hex'));let buffer;
 if(!refresh)try{buffer=await readFile(file);}catch{}
 if(!buffer)for(let attempt=0;attempt<3;attempt++)try{const r=await fetch(url,{signal:AbortSignal.timeout(60000)});if(!r.ok)throw Error(`HTTP ${r.status}: ${url}`);buffer=Buffer.from(await r.arrayBuffer());await writeFile(file,buffer);break;}catch(error){if(attempt===2)throw error;await new Promise(resolve=>setTimeout(resolve,1000*(attempt+1)));}
 receipts.push({url,bytes:buffer.length,sha256:createHash('sha256').update(buffer).digest('hex')});return buffer;
}
const csvUrl='https://hadeethenc.com/ar/browse/download/ar/csv';
const robots=(await get('https://hadeethenc.com/robots.txt')).toString();
if(/Disallow:\s*\/(?:\s|$)/.test(robots))throw Error('Review robots policy');
const csv=await get(csvUrl);const csvRows=parseHadithCsv(csv.toString('utf8').replace(/^\uFEFF/,''));
const notice=csvRows.shift()[0];const version=notice.match(/\(v([\d.]+)\)/)?.[1];
if(!version||!notice.includes("PLEASE DON'T REMOVE"))throw Error('Missing source edition or notice');
const header=csvRows.shift();const expected=['id','title','hadith_text','explanation','word_meanings','benefits','grade','takhrij','link'];
if(JSON.stringify(header)!==JSON.stringify(expected))throw Error('Changed source CSV schema');
const records=[];const collectionStats=[];
let accepted=0;
for(const values of csvRows){
 if(values.length!==header.length)throw Error('CSV column count');
 const raw=Object.fromEntries(header.map((key,index)=>[key,values[index]]));
 if(!raw.id||!raw.hadith_text.trim())throw Error('Empty source hadith');
 if(!encGrades.has(raw.grade))continue;
 if(new URL(raw.link).hostname!=='hadeethenc.com')throw Error('Unexpected source URL');
 records.push({id:`hadeethenc:${raw.id}`,collection:'hadeethenc',sourceId:'hadeethenc',number:raw.id,raw,qualification:'source-sahih',muttafaq:raw.takhrij==='متفق عليه',grade:raw.grade,gradedBy:'موسوعة الأحاديث النبوية',gradeOriginal:raw.grade,sourceUrl:raw.link});accepted++;
}
collectionStats.push({id:'hadeethenc',title:collectionTitles.hadeethenc,total:csvRows.length,accepted,excluded:csvRows.length-accepted});
const books=['bukhari','muslim','abudawud','tirmidhi','nasai','ibnmajah'];let cursor=0;
await Promise.all(Array.from({length:3},async()=>{while(cursor<books.length){const key=books[cursor++];const url=`${base}/editions/ara-${key}.json`;const source=JSON.parse((await get(url)).toString());if(!Array.isArray(source.hadiths)||source.hadiths.length<3000)throw Error(`Incomplete collection ${key}`);let count=0,blank=0;
 for(const raw of source.hadiths){
  if(!raw.text?.trim()){blank++;continue;}
  const sahihayn=['bukhari','muslim'].includes(key);const albani=qualifyingAlbani(raw.grades||[]);
  if(!sahihayn&&!albani)continue;
  if(!Number.isFinite(raw.hadithnumber))throw Error('Missing hadith number');
  records.push({id:`${key}:${raw.hadithnumber}`,collection:key,sourceId:'hadith-api',number:String(raw.arabicnumber??raw.hadithnumber),raw,qualification:sahihayn?'sahihayn':'albani',muttafaq:false,grade:sahihayn?`رواية في ${collectionTitles[key]}`:albaniGrades.get(albani.grade),gradedBy:sahihayn?collectionTitles[key]:'الألباني',gradeOriginal:sahihayn?'':albani.grade,sourceUrl:`https://github.com/fawazahmed0/hadith-api/blob/${commit}/editions/ara-${key}.json`});count++;
 }
 collectionStats.push({id:key,title:collectionTitles[key],total:source.hadiths.length,accepted:count,excluded:source.hadiths.length-count,blank});console.log(`${key}: ${count}/${source.hadiths.length}`);
}}));
if(records.length<25000||new Set(records.map(r=>r.id)).size!==records.length)throw Error('Incomplete or duplicate catalog');
records.sort((a,b)=>Object.keys(collectionTitles).indexOf(a.collection)-Object.keys(collectionTitles).indexOf(b.collection)||Number(a.raw.hadithnumber??a.number)-Number(b.raw.hadithnumber??b.number));
const license=(await get(`${base}/LICENSE`)).toString();if(!license.includes('public domain'))throw Error('Review license');
const retrievedAt=new Date().toISOString();
const sources=[{id:'hadith-api',title:'Hadith API',url:'https://github.com/fawazahmed0/hadith-api',version:commit,license:'Unlicense',notice:license},{id:'hadeethenc',title:'موسوعة الأحاديث النبوية',url:'https://hadeethenc.com/ar',version,notice,termsUrl:'https://hadeethenc.com/ar/home',downloadUrl:csvUrl}];
const stats={total:records.length,albani:records.filter(r=>r.qualification==='albani').length,muttafaq:records.filter(r=>r.muttafaq).length,sahihayn:records.filter(r=>r.qualification==='sahihayn').length};
const result={schemaVersion:1,retrievedAt,sources,collections:collectionStats.sort((a,b)=>Object.keys(collectionTitles).indexOf(a.id)-Object.keys(collectionTitles).indexOf(b.id)),stats,records};
await mkdir(path.join(root,'data/hadith'),{recursive:true});
const compressed=gzipSync(Buffer.from(JSON.stringify(result)),{level:9});
await writeFile(path.join(root,'data/hadith/catalog.json.gz'),compressed);
await writeFile(path.join(root,'data/hadith/hadeethenc-source.csv.gz'),gzipSync(csv,{level:9}));
await writeFile(path.join(root,'data/hadith/manifest.json'),JSON.stringify({schemaVersion:1,retrievedAt,stats,collections:result.collections,sources,sha256:createHash('sha256').update(compressed).digest('hex'),documents:receipts.sort((a,b)=>a.url.localeCompare(b.url))},null,2)+'\n');
console.log('Complete',stats,`compressed bytes: ${compressed.length}`);

import {readFile} from 'node:fs/promises';
import {gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {normalizeSearch} from './searchText.mjs';
const catalogFile=new URL('../data/hadith/catalog.json.gz',import.meta.url);
const manifestFile=new URL('../data/hadith/manifest.json',import.meta.url);
let pending;
export function loadHadithCatalog(){
  if(!pending)pending=Promise.all([readFile(catalogFile),readFile(manifestFile,'utf8')]).then(([bytes,text])=>{
    const manifest=JSON.parse(text);
    if(createHash('sha256').update(bytes).digest('hex')!==manifest.sha256)throw Error('Hadith snapshot checksum mismatch');
    const catalog=JSON.parse(gunzipSync(bytes,{maxOutputLength:180*1024*1024}).toString());
    if(catalog.schemaVersion!==1||catalog.records.length!==manifest.stats.total)throw Error('Invalid hadith snapshot');
    return catalog;
  }).catch(error=>{pending=null;throw error;});
  return pending;
}
export const hadithFilters=['all','albani','muttafaq','sahihayn'];
export const normalizeHadithQuery=text=>normalizeSearch(text.replace(/[٠-٩۰-۹]/g,digit=>String('٠١٢٣٤٥٦٧٨٩'.includes(digit)?'٠١٢٣٤٥٦٧٨٩'.indexOf(digit):'۰۱۲۳۴۵۶۷۸۹'.indexOf(digit))));
const indexes=new WeakMap();
function indexFor(catalog){
  if(!indexes.has(catalog))indexes.set(catalog,catalog.records.map(record=>({record,text:normalizeHadithQuery(`${record.raw.title||''} ${record.raw.hadith_text||record.raw.text}`)})));
  return indexes.get(catalog);
}
const stem=word=>word.replace(/^(?:وال|بال|فال|لل|ال)/,'');
export function queryHadiths(catalog,{q='',filter='all',book='',page=1,limit=12}={}){
  const normal=normalizeHadithQuery(q);const numeric=/^\d+(?:\.\d+)?$/.test(normal);
  const terms=normal.split(' ').filter(Boolean).map(stem);
  const records=normal?indexFor(catalog):catalog.records.map(record=>({record}));
  const rows=[];
  for(const item of records){const r=item.record;
    if(book&&r.collection!==book)continue;
    if(filter==='albani'&&r.qualification!=='albani')continue;
    if(filter==='muttafaq'&&!r.muttafaq)continue;
    if(filter==='sahihayn'&&r.qualification!=='sahihayn')continue;
    if(numeric&&r.number!==normal&&String(r.raw.hadithnumber)!==normal)continue;
    if(normal&&!numeric&&!terms.every(term=>item.text.includes(term)))continue;
    const score=normal&&!numeric?(item.text.includes(normal)?100:0)+terms.reduce((n,term)=>n+(normalizeHadithQuery(r.raw.title||'').includes(term)?5:0),0):0;
    rows.push({record:r,score,priority:r.collection==='hadeethenc'?0:r.qualification==='albani'?1:2});
  }
  rows.sort((a,b)=>b.score-a.score||a.priority-b.priority);
  const total=rows.length;return {total,page,pages:Math.ceil(total/limit),items:rows.slice((page-1)*limit,page*limit).map(item=>item.record)};
}
export const formatHadithText=text=>(text||'').replace(/\\u(200f|200e)/gi,(_,hex)=>String.fromCharCode(parseInt(hex,16)));
const graderNames={'Al-Albani':'الألباني','Ahmad Muhammad Shakir':'أحمد محمد شاكر','Muhammad Muhyi Al-Din Abdul Hamid':'محمد محيي الدين عبد الحميد','Muhammad Fouad Abd al-Baqi':'محمد فؤاد عبد الباقي','Shuaib Al Arnaut':'شعيب الأرنؤوط','Zubair Ali Zai':'زبير علي زئي','Abu Ghuddah':'أبو غدة'};
const gradeNames={'Sahih':'صحيح','Sahih Hadith':'حديث صحيح','Sahih Mutawatir':'صحيح متواتر','Sahih Lighairihi':'صحيح لغيره','Hasan Sahih':'حسن صحيح','Hasan':'حسن','Daif':'ضعيف','Very Daif':'ضعيف جدًا','Mawdu':'موضوع','Shadh':'شاذ','Munkar':'منكر','Sahih Isnaad':'صحيح الإسناد','Daif Isnaad':'ضعيف الإسناد','Hasan Isnaad':'حسن الإسناد','Sahih Maqtu':'صحيح مقطوع','Sahih Muquf':'صحيح موقوف','Sahih Matn':'صحيح المتن','Sahih - Bukhari And Muslim':'صحيح ـ البخاري ومسلم','Sahih Muslim':'صحيح ـ مسلم'};
export function describeHadith(catalog,record,{full=false,q=''}={}){
  const source=catalog.sources.find(s=>s.id===record.sourceId);const collection=catalog.collections.find(c=>c.id===record.collection);
  const text=formatHadithText(record.raw.hadith_text||record.raw.text);
  const result={id:record.id,collection:record.collection,collectionTitle:collection.title,number:record.number,numberLabel:record.collection==='hadeethenc'?'رقم بطاقة الموسوعة':'رقم الحديث',title:record.raw.title||`${collection.title} · ${record.number}`,excerpt:text.length>260?text.slice(0,260)+'…':text,grade:record.grade,gradedBy:record.gradedBy,muttafaq:record.muttafaq,qualification:record.qualification,sourceName:source.title,sourceVersion:source.version,sourceUrl:record.sourceUrl,hasExplanation:!!record.raw.explanation};
  if(full)Object.assign(result,{text,attribution:record.raw.takhrij||`${collection.title}، رقم ${record.number} بحسب ترقيم المجموعة`,explanation:record.raw.explanation||'',benefits:record.raw.benefits||'',wordMeanings:record.raw.word_meanings||'',gradeOriginal:record.gradeOriginal,otherGrades:(record.raw.grades||[]).map(g=>({name:graderNames[g.name]||g.name,grade:gradeNames[g.grade]||g.grade,originalName:g.name,originalGrade:g.grade})),reference:record.raw.reference||null,sourceNotice:source.notice});
  return result;
}

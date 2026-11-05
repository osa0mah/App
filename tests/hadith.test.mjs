import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {albaniGrades,encGrades,qualifyingAlbani,parseHadithCsv} from '../server/hadithPolicy.mjs';
import {loadHadithCatalog,queryHadiths,describeHadith} from '../server/hadithCatalog.mjs';
import {handler} from '../netlify/functions/hadiths.mjs';
import {answerMessage} from '../server/chatAnswers.mjs';
test('Albani acceptance excludes weak, chain-only, suspended and disconnected grades',()=>{
 for(const grade of ['Daif','Mawdu','Sahih Isnaad','Sahih Muquf','Sahih Maqtu','Sahih Matn','Hasan','Hasan Sahih Isnaad'])assert.equal(qualifyingAlbani([{name:'Al-Albani',grade}]),null,grade);
 for(const grade of albaniGrades.keys())assert.equal(qualifyingAlbani([{name:'Al-Albani',grade}]).grade,grade);
 assert.equal(qualifyingAlbani([{name:'Another scholar',grade:'Sahih'}]),null);
});
test('CSV parser preserves quoted multiline records and source edition notice',()=>{
 assert.deepEqual(parseHadithCsv('"first\r\nline","a,""b"""\r\n1,2\r\n'),[['first\r\nline','a,"b"'],['1','2']]);
 assert.throws(()=>parseHadithCsv('"unterminated'));
});
test('all catalog records have exact accepted source qualifications and truthful muttafaq flags',async()=>{
 const catalog=await loadHadithCatalog();
 assert.equal(catalog.records.length,catalog.stats.total);
 assert.equal(new Set(catalog.records.map(r=>r.id)).size,catalog.records.length);
 assert.ok(catalog.records.length>30000);
 let albani=0,muttafaq=0,sahihayn=0;
 for(const record of catalog.records){
  assert.ok((record.raw.text||record.raw.hadith_text).trim());
  assert.ok(record.sourceUrl.startsWith('https://'));
  if(record.qualification==='albani'){albani++;assert.ok(qualifyingAlbani(record.raw.grades));assert.equal(record.gradeOriginal,qualifyingAlbani(record.raw.grades).grade);}
  if(record.qualification==='sahihayn'){sahihayn++;assert.ok(['bukhari','muslim'].includes(record.collection));assert.equal(record.muttafaq,false);}
  if(record.collection==='hadeethenc'){assert.ok(encGrades.has(record.raw.grade));assert.equal(record.grade,record.raw.grade);assert.equal(record.muttafaq,record.raw.takhrij==='متفق عليه');}
  if(record.muttafaq){muttafaq++;assert.equal(record.collection,'hadeethenc');}
 }
 assert.deepEqual({albani,muttafaq,sahihayn},{albani:catalog.stats.albani,muttafaq:catalog.stats.muttafaq,sahihayn:catalog.stats.sahihayn});
});
test('HadeethEnc source records are retained verbatim and mixed or qualified negative judgements are excluded',async()=>{
 const manifest=JSON.parse(await readFile(new URL('../data/hadith/manifest.json',import.meta.url)));
 const csv=gunzipSync(await readFile(new URL('../data/hadith/hadeethenc-source.csv.gz',import.meta.url)));
 assert.equal(createHash('sha256').update(csv).digest('hex'),manifest.documents.find(d=>d.url.endsWith('/ar/csv')).sha256);
 const rows=parseHadithCsv(csv.toString());const notice=rows.shift()[0];const header=rows.shift();const originals=new Map(rows.map(values=>{const raw=Object.fromEntries(header.map((name,i)=>[name,values[i]]));return [raw.id,raw];}));
 const catalog=await loadHadithCatalog();
 for(const record of catalog.records.filter(r=>r.collection==='hadeethenc'))assert.deepEqual(record.raw,originals.get(record.number));
 assert.ok(catalog.sources.find(s=>s.id==='hadeethenc').notice===notice);
 assert.ok(!catalog.records.some(r=>r.raw.grade==='ضعيف'||/موقوف/.test(r.grade)));
});
test('Arabic text and digits, filters, book restriction, and pagination return source-backed results',async()=>{
 const catalog=await loadHadithCatalog();
 const results=queryHadiths(catalog,{q:'تَعَاهَدُوا هَذَا الْقُرْآنَ',filter:'muttafaq'});
 assert.ok(results.items.some(r=>r.id==='hadeethenc:5907'));
 assert.ok(results.items.every(r=>r.muttafaq));
 const albani=queryHadiths(catalog,{q:'صلاة',filter:'albani',book:'tirmidhi'});
 assert.ok(albani.total>0);assert.ok(albani.items.every(r=>r.collection==='tirmidhi'&&qualifyingAlbani(r.raw.grades)));
 assert.ok(queryHadiths(catalog,{q:'٢',book:'abudawud'}).items.every(r=>r.number==='2'||r.raw.hadithnumber===2));
 const first=queryHadiths(catalog,{page:1});const next=queryHadiths(catalog,{page:2});assert.ok(!first.items.some(r=>next.items.some(n=>n.id===r.id)));
 const detail=describeHadith(catalog,results.items.find(r=>r.id==='hadeethenc:5907'),{full:true});assert.ok(detail.explanation);assert.equal(detail.attribution,'متفق عليه');
});
test('hadith API validates requests, serves exact details, and never calls a missing result weak',async()=>{
 assert.equal((await handler({httpMethod:'POST'})).statusCode,405);
 for(const parameters of [{filter:'unknown'},{page:'-1'},{q:'x'.repeat(201)},{book:'unknown'},{action:'delete'}])assert.equal((await handler({httpMethod:'GET',queryStringParameters:parameters})).statusCode,400);
 assert.equal((await handler({httpMethod:'GET',queryStringParameters:{action:'read',id:'missing'}})).statusCode,404);
 const response=await handler({httpMethod:'GET',queryStringParameters:{action:'read',id:'abudawud:2'}});assert.equal(response.statusCode,200);const detail=JSON.parse(response.body).hadith;assert.equal(detail.gradedBy,'الألباني');assert.equal(detail.gradeOriginal,'Sahih');assert.ok(detail.otherGrades.some(g=>g.originalGrade==='Daif'));
});
test('assistant quotes hadiths and links directly to the local detail, without inventing a missing grading',async()=>{
 const answer=await answerMessage('حديث تعاهدوا هذا القرآن متفق عليه');
 assert.match(answer.text,/متفق عليه/);assert.ok(answer.sources.some(s=>s.suggestion.hadithId==='hadeethenc:5907'));assert.equal(answer.sources[0].suggestion.section,'الأحاديث');
 const missing=await answerMessage('ما صحة حديث عباراتاختبارلاتوجد');assert.match(missing.text,/لا يعني أن الحديث ضعيف/);
 const general=await answerMessage('أريد أحاديث');assert.match(general.text,/اكتب كلمات/);
});

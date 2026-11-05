import test from 'node:test';
import assert from 'node:assert/strict';
import catalog from '../data/learning/mokhtasar.json' with {type:'json'};
import manifest from '../data/learning/import-manifest.json' with {type:'json'};
import {answerMessage} from '../server/chatAnswers.mjs';
const noSearch = {search:async()=>{assert.fail('A learning request must not search fatwas');}};
test('learning includes every surah and every source benefit page with source provenance',()=>{
  assert.deepEqual(catalog.chapters.map(c=>c.id),Array.from({length:114},(_,i)=>i+1));
  assert.equal(catalog.chapters.reduce((sum,c)=>sum+c.verseCount,0),6236);
  assert.deepEqual(catalog.pages.map(p=>p.page),Array.from({length:604},(_,i)=>i+1));
  assert.equal(catalog.source.version,manifest.sourceVersion);
  assert.equal(catalog.source.publisher,'مركز تفسير للدراسات القرآنية');
  const pageMap=new Map(catalog.pages.map(p=>[p.page,p]));
  for(const chapter of catalog.chapters){
    assert.ok(chapter.purposes.length>0);
    assert.ok(chapter.purposes.every(p=>p.trim().length>10));
    assert.ok(chapter.pageNumbers.length>0);
    for(const number of chapter.pageNumbers) assert.ok(pageMap.get(number)?.chapters.includes(chapter.id));
  }
  const ids=new Set();
  for(const page of catalog.pages){
    assert.ok(page.benefits.length>0);
    assert.equal(new URL(page.sourceUrl).hostname,'quranenc.com');
    for(const benefit of page.benefits){assert.ok(benefit.text.trim().length>10);assert.ok(!ids.has(benefit.id));ids.add(benefit.id);}
  }
  assert.equal(ids.size,2208);
  assert.ok(manifest.documents.every(d=>/^[a-f0-9]{64}$/.test(d.sha256)));
});
test('all 114 chapter names and Arabic numbers resolve to their complete source purposes',async()=>{
  const history=[{role:'user',content:'مقاصد العمل'},{role:'assistant',content:'أي سورة تقصد؟ اكتب اسمها لأعرض مقاصدها.'}];
  for(const chapter of catalog.chapters){
    for(const message of [chapter.name,chapter.id.toLocaleString('ar-SA')]){
      const answer=await answerMessage(message,history,noSearch);
      assert.equal(answer.suggestion.chapter,chapter.id,`${chapter.id}: ${message}`);
      for(const purpose of chapter.purposes) assert.ok(answer.text.includes(purpose));
      assert.equal(answer.source.url,chapter.sourceUrl);
      assert.match(answer.source.title,/QuranEnc.com.*1\.0\.0/);
    }
  }
});
test('the long-surah chat continuation reaches every benefit page without gaps or repetition',async()=>{
  const chapter=catalog.chapters.find(c=>c.id===2);
  const visited=[];
  let answer=await answerMessage('مقاصد العلم والعمل في سورة البقرة',[],noSearch);
  while(true){
    const numbers=[...answer.text.matchAll(/فوائد صفحة المصدر (\d+):/g)].map(m=>Number(m[1]));
    assert.ok(numbers.length>0);visited.push(...numbers);
    for(const number of numbers) for(const benefit of catalog.pages[number-1].benefits) assert.ok(answer.text.includes(benefit.text));
    if(!answer.choices?.length)break;
    assert.ok(visited.length<=chapter.pageNumbers.length);
    answer=await answerMessage(answer.choices[0].message,[],noSearch);
  }
  assert.deepEqual(visited,chapter.pageNumbers);
});
test('shared pages stay explicitly attributed to all their surahs',async()=>{
  const answer=await answerMessage('ما مقاصد سورة الإخلاص',[],noSearch);
  assert.match(answer.text,/صفحة مشتركة: الإخلاص، الفلق، الناس/);
  assert.match(answer.text,/ليست كلها خاصة بسورة الإخلاص/);
});
test('learning retains a newly supported chapter for pronoun follow-ups and rejects a foreign page',async()=>{
  const answer=await answerMessage('ومقاصدها؟',[{role:'user',content:'تفسير سورة البقرة'}],noSearch);
  assert.equal(answer.suggestion.chapter,2);
  const invalid=await answerMessage('فوائد سورة البقرة من صفحة 604',[],noSearch);
  assert.match(invalid.text,/ليست ضمن صفحات سورة البقرة/);
});

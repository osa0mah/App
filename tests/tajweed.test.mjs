import test from 'node:test';
import assert from 'node:assert/strict';
import curriculum from '../data/tajweed/lessons.json' with {type:'json'};
import media from '../data/tajweed/media.json' with {type:'json'};
import quran from '../data/chapters.json' with {type:'json'};
import {answerMessage} from '../server/chatAnswers.mjs';
test('every tajweed lesson has an explicit rule, contextual Quran example, references and matching teacher media',()=>{
 assert.equal(curriculum.lessons.length,30);assert.equal(curriculum.groups.length,7);
 assert.equal(new Set(curriculum.lessons.map(l=>l.id)).size,30);
 const clips=new Map(media.clips.map(c=>[c.id,c]));
 for(const lesson of curriculum.lessons){
  assert.ok(curriculum.groups.some(g=>g.id===lesson.group));assert.ok(lesson.summary.length>20);assert.ok(lesson.steps.length>=3);assert.ok(lesson.commonMistake);assert.ok(lesson.examples.length);assert.ok(lesson.media.ayman.length);
  for(const teacher of ['ayman','fares'])for(const id of lesson.media[teacher]){const clip=clips.get(id);assert.ok(clip,`${lesson.id}: ${id}`);assert.equal(clip.teacher,teacher);assert.equal(clip.type,teacher==='ayman'?'video':'audio');}
  for(const id of lesson.references)assert.ok(curriculum.references.some(r=>r.id===id));
  assert.ok(lesson.question.answerIndex>=0&&lesson.question.answerIndex<lesson.question.choices.length);assert.ok(lesson.question.explanation);
 }
});
test('all 35 highlighted examples are literal spans in their actual surah and verse',()=>{
 const examples=curriculum.lessons.flatMap(l=>l.examples);assert.equal(examples.length,35);
 for(const example of examples){const chapter=quran.chapters[example.chapter-1];assert.ok(chapter);const text=chapter.verses[example.verse-1];assert.ok(text);const words=text.split(/\s+/);assert.ok(example.firstWord>=1&&example.lastWord>=example.firstWord&&example.lastWord<=words.length);assert.equal(words.slice(example.firstWord-1,example.lastWord).join(' '),example.focus);assert.ok(text.includes(example.focus));assert.ok(example.context);}
 for(const id of ['madd-iwad','madd-arid','madd-leen'])assert.equal(curriculum.lessons.find(l=>l.id===id).examples[0].context,'عند الوقف');
 assert.ok(curriculum.lessons.find(l=>l.id==='idgham-ghunnah').steps.some(s=>s.includes('الدنيا')));
 assert.ok(curriculum.lessons.find(l=>l.id==='madd-silah-small').steps.some(s=>s.includes('يرضه لكم')));
});
test('streaming references keep provenance, teacher and medium separate without fabricated video ids',()=>{
 assert.equal(media.clips.filter(c=>c.type==='video').length,28);assert.equal(media.clips.filter(c=>c.type==='audio').length,30);
 for(const clip of media.clips){const url=new URL(clip.streamUrl);assert.equal(url.protocol,'https:');assert.equal(url.hostname,'archive.org');assert.equal(decodeURIComponent(url.pathname),`/download/${clip.itemId}/${clip.fileName}`);assert.equal(new URL(clip.sourceUrl).hostname,'archive.org');assert.ok(clip.size>0);assert.ok(clip.duration>0);if(clip.teacher==='ayman')assert.match(clip.title,/أيمن.*سويد/);else assert.equal(clip.itemId,'20_20240810_202408');}
 assert.ok(media.documents.every(d=>/^[a-f0-9]{64}$/.test(d.sha256)));
});
test('assistant explains the exact tajweed lesson, asks for ambiguous rules and respects an explicit fatwa source',async()=>{
 const answer=await answerMessage('اشرح الإخفاء الحقيقي في التجويد');assert.equal(answer.suggestion.section,'التجويد');assert.equal(answer.suggestion.lessonId,'ikhfa');assert.match(answer.text,/سورة الفلق/);assert.match(answer.text,/عند الوصل/);assert.match(answer.text,/إعداد أثر القرآن/);
 const generic=await answerMessage('اشرح الإدغام');assert.equal(generic.choices.length,3);assert.equal(generic.suggestion.section,'التجويد');
 let searches=0;const legal=await answerMessage('فتوى ابن باز عن التجويد',[],{search:async()=>{searches++;return [];}});assert.ok(searches);assert.notEqual(legal.suggestion.section,'التجويد');
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {load} from 'cheerio';
import quran from '../data/chapters.json' with {type:'json'};
import muyassar from '../data/tafsir/muyassar.json' with {type:'json'};
import introductions from '../data/learning/introductions.json' with {type:'json'};
import {answerMessage} from '../server/chatAnswers.mjs';
import {findChapter} from '../server/quranContent.mjs';
const {chapters}=quran;
test('all 6236 reading verses and basmalas match the original Tanzil XML verbatim',async()=>{
  assert.equal(chapters.length,114);
  assert.equal(chapters.reduce((sum,c)=>sum+c.verses.length,0),6236);
  for(const [filename,field,source] of [['tanzil-uthmani.xml','verses',quran.source],['tanzil-simple.xml','recitationVerses',quran.source.recitationEdition]]){
    const xml=await readFile(new URL(`../data/quran/${filename}`,import.meta.url),'utf8');
    assert.equal(createHash('sha256').update(xml).digest('hex'),source.sha256);
    assert.ok(source.copyrightNotice.includes('CHANGING IT IS NOT ALLOWED'));
    const $=load(xml,{xmlMode:true});
    for(const chapter of chapters){
      const rows=$(`sura[index="${chapter.id}"] aya`);
      assert.equal(rows.length,chapter[field].length);
      rows.each((i,e)=>assert.equal(chapter[field][i],$(e).attr('text'),`${field} ${chapter.id}:${i+1}`));
      if(field==='verses') assert.equal(chapter.bismillah,rows.first().attr('bismillah')||'');
    }
  }
  assert.equal(chapters[8].bismillah,'');
  assert.equal(chapters[0].bismillah,'');
  assert.ok(chapters[1].bismillah);
  assert.equal(chapters[1].verses.length,286);
  assert.equal(chapters.at(-1).verses.length,6);
});
test('every Quran verse has a complete local Muyassar entry and every surah has a separated introduction',()=>{
  assert.equal(muyassar.ayahs.length,6236);
  const entries=new Map(muyassar.ayahs.map(a=>[`${a.surah}:${a.ayah}`,a]));
  assert.equal(entries.size,6236);
  assert.equal(introductions.chapters.length,114);
  for(const chapter of chapters){
    for(let verse=1;verse<=chapter.verses.length;verse++) assert.ok(entries.get(`${chapter.id}:${verse}`)?.text.trim());
    const introduction=introductions.chapters.find(c=>c.id===chapter.id);
    assert.ok(introduction.naming.startsWith('•'));
    assert.ok(introduction.purposes.length>0);
    assert.ok(introduction.purposes.every(p=>p.startsWith('•')));
    assert.ok(introduction.firstVerseTafsir.length>15);
    assert.doesNotMatch(introduction.firstVerseTafsir,/تسمية السورة|من مقاصد السورة/);
    assert.ok(entries.get(`${chapter.id}:1`).text.includes(introduction.firstVerseTafsir));
  }
});
test('surah lookup uses word boundaries instead of treating letters inside unrelated questions as chapter names',()=>{
  assert.equal(findChapter('حكم قصر الصلاة'),null);
  assert.equal(findChapter('أبغى أستفسر عن صلاة الوتر'),null);
  assert.equal(findChapter('تفسير سورة ق').id,50);
  assert.equal(findChapter('تفسير سورة ص').id,38);
  assert.equal(findChapter('تفسير سورة 114').id,114);
});
test('the assistant retrieves new surahs and late verse numbers without returning a huge whole-surah reply',async()=>{
  const baqarah=await answerMessage('تفسير الآية ٢٨٦ من سورة البقرة');
  assert.match(baqarah.text,/التفسير الميسر لسورة البقرة، الآية 286/);
  assert.ok(baqarah.text.includes(muyassar.ayahs.find(a=>a.surah===2&&a.ayah===286).text));
  const whole=await answerMessage('تفسير سورة البقرة');
  assert.ok(whole.text.length<10000);
  assert.match(whole.text,/أول ثلاث آيات/);
  const last=await answerMessage('تفسير الآية ٦ من سورة الناس');
  assert.equal(last.suggestion.chapter,114);
  assert.equal(last.suggestion.verse,6);
});

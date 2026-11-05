import test from 'node:test';
import assert from 'node:assert/strict';
import quran from '../data/chapters.json' with {type:'json'};
import {mushafPages,mushafJuz,mushafChapters,pageForVerse,pageSections,boundedPage,swipePageDelta,parsePageNumber} from '../src/features/mushaf.ts';
test('604 source pages cover every original Quran verse exactly once in order',()=>{
 assert.equal(mushafPages.length,604);assert.equal(mushafJuz.length,30);assert.equal(mushafChapters.length,114);
 const actual=mushafPages.flatMap(page=>pageSections(page.number).flatMap(section=>section.verses));
 const expected=quran.chapters.flatMap(chapter=>chapter.verses.map((text,index)=>({chapter:chapter.id,verse:index+1,text})));
 assert.deepEqual(actual,expected);assert.equal(new Set(actual.map(v=>`${v.chapter}:${v.verse}`)).size,6236);
 for(const chapter of quran.chapters){assert.equal(pageForVerse(chapter.id),mushafChapters[chapter.id-1].firstPage);assert.equal(pageForVerse(chapter.id,chapter.verses.length),mushafChapters[chapter.id-1].lastPage);}
});
test('surah boundaries, shared pages, opening headers and basmalas follow their exact verses',()=>{
 assert.equal(pageForVerse(1,7),1);assert.equal(pageForVerse(2,1),2);assert.equal(pageForVerse(2,6),3);
 assert.equal(pageForVerse(2,286),49);assert.equal(pageForVerse(3,1),50);
 assert.equal(pageSections(3)[0].showHeading,false);assert.equal(pageSections(3)[0].bismillah,'');
 const tawbah=pageSections(pageForVerse(9)).find(s=>s.chapter===9);assert.equal(tawbah.showHeading,true);assert.equal(tawbah.bismillah,'');
 const last=pageSections(604);assert.deepEqual(last.map(s=>s.chapter),[112,113,114]);assert.ok(last.every(s=>s.showHeading&&s.bismillah));assert.equal(last.at(-1).verses.at(-1).verse,6);
 for(const juz of mushafJuz){assert.equal(pageForVerse(juz.chapter,juz.verse),juz.page);assert.ok(mushafPages[juz.page-1].juz <= juz.number && mushafPages[juz.page-1].endJuz >= juz.number);}
});
test('page lookup rejects invalid verse references instead of silently opening another place',()=>{
 for(const reference of [[0,1],[115,1],[2,0],[2,287],[2,1.5]])assert.throws(()=>pageForVerse(...reference),RangeError);
 assert.throws(()=>pageSections(0),RangeError);assert.throws(()=>pageSections(605),RangeError);
});
test('Arabic mushaf swipe direction ignores taps and vertical scrolling, and stops at book boundaries',()=>{
 assert.equal(swipePageDelta(120,15),1);assert.equal(swipePageDelta(-120,15),-1);
 for(const [x,y] of [[8,1],[40,2],[70,100],[0,200]])assert.equal(swipePageDelta(x,y),0);
 assert.equal(boundedPage(0),1);assert.equal(boundedPage(605),604);
});
test('direct page input accepts Arabic and Persian digits and rejects invalid pages',()=>{
 assert.equal(parsePageNumber(' ٦٠٤ '),604);assert.equal(parsePageNumber('۱۲۳'),123);assert.equal(parsePageNumber('1'),1);
 for(const value of ['', '0','605','-1','1.5','12abc'])assert.equal(parsePageNumber(value),null,value);
});

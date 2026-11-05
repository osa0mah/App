import test from "node:test";
import assert from "node:assert/strict";
import { normalizeArabic, matchRecitation } from "../src/features/recitation.ts";
const verses = ["قُلْ هُوَ اللَّهُ أَحَدٌ", "اللَّهُ الصَّمَدُ", "لَمْ يَلِدْ وَلَمْ يُولَدْ", "وَلَمْ يَكُنْ لَهُ كُفُوًا أَحَدٌ"].map(v => normalizeArabic(v).split(" "));
const initial = () => ({ verse: 0, pending: [] });
test("matching ignores vowel marks but keeps different words distinct", () => {
  assert.equal(normalizeArabic("إِيَّاكَ نَعْبُدُ"), "اياك نعبد");
  assert.notEqual(normalizeArabic("نعبد"), normalizeArabic("نستعين"));
});
test("user example: Falaq reveals nothing, then the corrected Ikhlas verse appears", () => {
  const wrong = matchRecitation(verses, initial(), "قل أعوذ برب الفلق");
  assert.equal(wrong.verse, 0);
  assert.deepEqual(wrong.pending, []);
  assert.equal(matchRecitation(verses, wrong, "قل هو الله أحد").verse, 1);
});
test("a shared prefix or a nearly correct verse never reveals any words", () => {
  const partial = matchRecitation(verses, initial(), "قل هو");
  assert.equal(partial.verse, 0);
  assert.equal(matchRecitation(verses, partial, "الله أحد").verse, 1);
  const wrong = matchRecitation(verses, initial(), "قل هو الله الصمد");
  assert.equal(wrong.verse, 0);
  assert.equal(matchRecitation(verses, wrong, "أحد").verse, 0);
});
test("later verses cannot be revealed before the required verse", () => {
  assert.equal(matchRecitation(verses, initial(), "الله الصمد").verse, 0);
  const first = matchRecitation(verses, initial(), "قل هو الله أحد");
  assert.equal(matchRecitation(verses, first, "لم يلد ولم يولد").verse, 1);
});
test("a corrected verse after wrong speech in one result is accepted", () => {
  assert.equal(matchRecitation(verses, initial(), "قل أعوذ برب الفلق قل هو الله أحد").verse, 1);
});
test("continuous reading reveals multiple verses and handles cumulative or repeated results", () => {
  let p = matchRecitation(verses, initial(), "قل هو الله أحد الله الصمد");
  assert.equal(p.verse, 2);
  assert.equal(matchRecitation(verses, p, "قل هو الله أحد الله الصمد").verse, 2);
  p = matchRecitation(verses, p, "قل هو الله أحد الله الصمد لم يلد ولم يولد ولم يكن له كفوا أحد");
  assert.equal(p.verse, 4);
  assert.deepEqual(matchRecitation(verses, p, "صوت إضافي"), p);
});
test("wrong continuation discards hidden partial words before a retry", () => {
  let p = matchRecitation(verses, initial(), "قل هو");
  p = matchRecitation(verses, p, "أعوذ برب الناس");
  assert.deepEqual(p, initial());
  assert.equal(matchRecitation(verses, p, "الله أحد").verse, 0);
  assert.equal(matchRecitation(verses, p, "قل قل هو الله أحد").verse, 1);
});

test("word mode reveals each matching word and stops at the first incorrect word", async () => {
  const { matchRecitationWords } = await import("../src/features/recitation.ts");
  const words = verses.flat();
  assert.equal(matchRecitationWords(words, 0, "قل"), 1);
  assert.equal(matchRecitationWords(words, 0, "قل أعوذ برب الفلق"), 1);
  assert.equal(matchRecitationWords(words, 1, "أعوذ برب الفلق"), 1);
  assert.equal(matchRecitationWords(words, 1, "قل هو الله أحد"), 4);
  assert.equal(matchRecitationWords(words, 4, "قل هو الله أحد"), 4);
  assert.equal(matchRecitationWords(words, 4, "لم يلد ولم يولد"), 4);
  assert.equal(matchRecitationWords(words, 4, "الله خطأ الصمد"), 5);
  assert.equal(matchRecitationWords(words, 5, "الله الصمد"), 6);
});
test("word hypotheses can be revised without committing their partial words", async () => {
  const { matchRecitationWords } = await import("../src/features/recitation.ts");
  const words = verses.flat();
  const committed = 0;
  assert.equal(matchRecitationWords(words, committed, "قل هو"), 2);
  assert.equal(matchRecitationWords(words, committed, "قل أعوذ"), 1);
  assert.equal(matchRecitationWords(words, committed, "قل هو الله أحد"), 4);
  assert.equal(matchRecitationWords(words, 4, "الله الصمد لم يلد ولم يولد ولم يكن له كفوا أحد"), words.length);
});

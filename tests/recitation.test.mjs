import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizeArabic,
  advanceRecitation,
} from "../src/features/recitation.ts";
const words = normalizeArabic(
  "بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ الْحَمْدُ لِلَّهِ رَبِّ الْعَالَمِينَ",
).split(" ");
test("matching removes vowel marks while preserving actual word differences", () => {
  assert.equal(normalizeArabic("إِيَّاكَ نَعْبُدُ"), "اياك نعبد");
  assert.notEqual(normalizeArabic("نعبد"), normalizeArabic("نستعين"));
});
test("words appear sequentially and an entire matching verse advances together", () => {
  assert.equal(advanceRecitation(words, 0, "بسم"), 1);
  assert.equal(advanceRecitation(words, 1, "الله الرحمن الرحيم"), 4);
  assert.equal(advanceRecitation(words, 0, "بسم الله الرحمن الرحيم"), 4);
});
test("wrong words cannot skip ahead to a later verse", () => {
  assert.equal(advanceRecitation(words, 0, "الحمد لله رب العالمين"), 0);
  assert.equal(advanceRecitation(words, 0, "بسم الرحمن الرحيم"), 1);
  assert.equal(advanceRecitation(words, 1, "خطأ الله الرحمن"), 1);
});
test("repeated and cumulative final transcripts do not duplicate progress", () => {
  assert.equal(advanceRecitation(words, 4, "بسم الله الرحمن الرحيم"), 4);
  assert.equal(
    advanceRecitation(words, 4, "بسم الله الرحمن الرحيم الحمد لله"),
    6,
  );
  assert.equal(advanceRecitation(words, 4, ""), 4);
});

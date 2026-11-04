import test from "node:test";
import assert from "node:assert/strict";
import {
  surahs,
  findDestination,
  scholars,
} from "../src/content.ts";
test("sample surahs have the expected verse counts and unique IDs", () => {
  assert.equal(new Set(surahs.map((s) => s.id)).size, surahs.length);
  assert.equal(surahs.find((s) => s.id === 1).verses.length, 7);
  assert.equal(surahs.find((s) => s.id === 112).verses.length, 4);
  assert.ok(surahs.every((s) => s.verses.every((v) => v.trim().length > 0)));
});
test("assistant routes requests without inventing answers", () => {
  assert.equal(findDestination("أريد تفسير سورة الفاتحة"), "تعلّم");
  assert.equal(findDestination("أريد فتاوى ابن باز"), "الفتاوى");
  assert.equal(findDestination("تسميع سورة الإخلاص"), "التسميع");
  assert.equal(findDestination("افتح سورة الفاتحة"), "القرآن");
  assert.equal(findDestination("مرحبًا"), null);
});
test("scholar links use separate HTTPS official hosts", () => {
  assert.equal(new Set(scholars.map((s) => new URL(s.url).hostname)).size, 3);
  assert.ok(scholars.every((s) => new URL(s.url).protocol === "https:"));
});

import test from "node:test";
import assert from "node:assert/strict";
import { validateArchiveAudio, archivedAudioFatwa } from "../server/archiveAudio.mjs";
import { sanitizeSnapshot } from "../server/catalogSnapshot.mjs";
import { extractArticle, providers } from "../server/fatwaSources.mjs";
const source = "https://www.alfawzan.af.org.sa/sites/default/files/test.mp3";
const audio = { provider: "alfawzan", contentKind: "archived-audio", id: "/sites/default/files/test.mp3", sourceUrl: source, archiveUrl: `https://web.archive.org/web/20251012120000id_/${source}`, title: "تسجيل فتاوى اختباري", titleOrigin: "archive" };
test("archived recordings retain an explicit original source and capture date without inventing answer text", () => {
  const value = archivedAudioFatwa(audio, providers.alfawzan.name, "2026-11-05T00:00:00Z");
  assert.equal(value.answer, "");
  assert.equal(value.audioUrl, audio.archiveUrl);
  assert.equal(value.archivedAt, "2025-10-12T12:00:00Z");
});
test("archive URLs cannot target another host, an arbitrary original domain, or a mismatched official file", () => {
  assert.equal(validateArchiveAudio({ ...audio, archiveUrl: audio.archiveUrl.replace("web.archive.org", "evil.test") }), null);
  assert.equal(validateArchiveAudio({ ...audio, archiveUrl: audio.archiveUrl.replace("www.alfawzan.af.org.sa/sites", "evil.test/sites") }), null);
  assert.equal(validateArchiveAudio({ ...audio, archiveUrl: audio.archiveUrl.replace("test.mp3", "other.mp3") }), null);
  assert.equal(validateArchiveAudio({ ...audio, audioUrl: "https://evil.test/audio.mp3" }), null);
  const clean = sanitizeSnapshot({ schemaVersion: 1, generatedAt: "2026-11-05T00:00:00Z", sources: [{ key: "alfawzan" }], records: [{ ...audio, answer: "not a verified answer" }] });
  assert.equal(clean.records.length, 1);
  assert.ok(!JSON.stringify(clean).includes("not a verified answer"));
  assert.equal(clean.records[0].contentKind, "archived-audio");
});
test("an archived question page can link a separately dated recording from the same official source", () => {
  const node = { ...audio, id: "/ar/node/123", sourceUrl: "https://www.alfawzan.af.org.sa/ar/node/123", archiveUrl: "https://web.archive.org/web/20251012120000id_/https://www.alfawzan.af.org.sa/ar/node/123", audioUrl: audio.archiveUrl, question: "نص السؤال المنشور للاختبار" };
  const value = archivedAudioFatwa(node, providers.alfawzan.name, "2026-11-05");
  assert.equal(value.question, node.question);
  assert.equal(value.answer, "");
  assert.equal(value.audioUrl, audio.archiveUrl);
});
test("Fawzan question-only HTML is never mislabeled as a written answer", () => {
  const article = extractArticle('<h1>عنوان اختبار</h1><article><div data-source="/sites/default/files/test.mp3"></div><div class="field--name-field-question"><div class="field__label">السؤال</div><div class="field__item">نص السؤال هذا سؤال تجريبي طويل يختبر عدم عرض السؤال كأنه جواب الشيخ.</div></div></article>', "https://www.alfawzan.af.org.sa/ar/node/123", providers.alfawzan);
  assert.equal(article.answer, "");
  assert.match(article.question, /سؤال تجريبي/);
  assert.equal(article.audioUrl, source);
});

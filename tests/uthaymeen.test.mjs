import test from "node:test";
import assert from "node:assert/strict";
import { collectCatalog } from "../server/catalogBuild.mjs";
import { providers, readSource } from "../server/fatwaSources.mjs";
import { sanitizeSnapshot } from "../server/catalogSnapshot.mjs";
import { queryCatalog } from "../server/fatwaCatalog.mjs";
const uuid = "000083d0-a741-476c-8c36-953fe93fa1eb";
const path = `/ar/voice_library/lessonDetails/${encodeURIComponent("فتاوى نور على الدرب")}/${encodeURIComponent("حكم صلاة الوتر")}/${uuid}`;
const json = (data) => new Response(JSON.stringify({ data }), { headers: { "content-type": "application/json" } });
const lesson = { id: uuid, type: "audios", title: { ar: "حكم صلاة الوتر" }, objective: { text_display: true, content: { ar: "<p>السؤال: سؤال الاختبار</p><p>الجواب: نص اختبار من المصدر</p><script>private script</script>" } } };
test("new official sitemap paths are searchable and deduplicated by lesson UUID", async () => {
  const catalog = await collectCatalog({ keys: ["ibnothaimeen"], maxPages: 2,
    fetcher: async (url) => new Response(url.endsWith("robots.txt") ? "User-agent: *\nAllow: /"
      : url.endsWith("sitemap.xml") ? `<?xml version="1.0"?><urlset><url><loc>https://binothaimeen.net${path}</loc></url><url><loc>https://binothaimeen.net${path.replace(encodeURIComponent("فتاوى نور على الدرب"), "other")}</loc></url><url><loc>https://evil.test${path}</loc></url></urlset>` : "<div id='root'></div>"),
  });
  const saved = sanitizeSnapshot(catalog);
  assert.equal(saved.records.length, 1);
  assert.equal(saved.records[0].titleOrigin, "sitemap");
  assert.equal(queryCatalog(saved, "ibnothaimeen", "الوتر")[0].id, path);
  assert.ok(!JSON.stringify(saved).includes("الجواب"));
});
test("new lesson routes read the official JSON answer internally with fixed API host", async () => {
  const article = await readSource(providers.ibnothaimeen, path, async (url, init) => {
    assert.equal(new URL(url).hostname, "shekhapi.binothaimeen.net");
    assert.match(new URL(url).pathname, new RegExp(uuid));
    assert.equal(init.redirect, "error");
    return json(lesson);
  });
  assert.equal(article.sourceUrl, `https://binothaimeen.net${path}`);
  assert.match(article.answer, /نص اختبار من المصدر/);
  assert.ok(!article.answer.includes("private script"));
});
test("missing text and mismatched API identities never yield an invented answer", async () => {
  await assert.rejects(readSource(providers.ibnothaimeen, path, async () => json({ ...lesson, objective: null })), /لا يتوفر نص/);
  await assert.rejects(readSource(providers.ibnothaimeen, path, async () => json({ ...lesson, id: "other" })), /لا تطابق/);
  let called = false;
  await assert.rejects(readSource(providers.ibnothaimeen, "//evil.test/" + uuid, async () => { called = true; }));
  assert.equal(called, false);
});

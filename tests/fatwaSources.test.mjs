import test from "node:test";
import assert from "node:assert/strict";
import {
  providers,
  extractSearch,
  extractArticle,
  discoverSearch,
  sourceHtml,
  searchSource,
  readSource,
} from "../server/fatwaSources.mjs";
import { handler } from "../netlify/functions/fatwas.mjs";
const p = providers.binbaz;
const html =
  "<html><h1>عنوان اختبار</h1><article><h1>عنوان اختبار</h1><p>هذا نص عربي تجريبي لا يمثل فتوى حقيقية ويستخدم فقط لاختبار استخراج المحتوى.</p><script>bad()</script><nav>قائمة لا تخص النص</nav></article></html>";
const response = (body, status = 200, headers = {}) =>
  new Response(body, {
    status,
    headers: { "Content-Type": "text/html", ...headers },
  });
test("search links are limited to the chosen official source and deduplicated", () => {
  const results = extractSearch(
    '<main><a href="/fatwas/123/title">عنوان فتوى اختبار</a><a href="/fatwas/123/title">مكرر</a><a href="https://evil.test/fatwas/1">عنوان خارجي ممنوع</a><a href="/audios/3">تسجيل صوتي</a></main>',
    p.base,
    p,
  );
  assert.equal(results.length, 1);
  assert.equal(results[0].id, "/fatwas/123/title");
  assert.equal(results[0].scholar, p.name);
});
test("article keeps original text and source without scripts or menus", () => {
  const result = extractArticle(html, `${p.base}/fatwas/123/title`, p);
  assert.equal(result.title, "عنوان اختبار");
  assert.match(result.answer, /نص عربي تجريبي/);
  assert.ok(!result.answer.includes("bad()"));
  assert.ok(!result.answer.includes("قائمة لا تخص"));
  assert.equal(result.question, "");
});
test("audio-only pages cannot be presented as text answers", () => {
  assert.throws(() =>
    extractArticle(
      '<h1>صوت فقط</h1><audio src="/x.mp3"></audio>',
      `${p.base}/fatwas/123`,
      p,
    ),
  );
});
test("search form discovery preserves official parameters and rejects off-site forms", () => {
  const u = discoverSearch(
    '<form action="/search"><input name="q" type="search"><input type="hidden" name="type" value="fatwa"></form>',
    p.base,
    p,
    "صلاة",
  );
  assert.equal(new URL(u).searchParams.get("q"), "صلاة");
  assert.equal(new URL(u).searchParams.get("type"), "fatwa");
  assert.equal(
    discoverSearch(
      '<form action="https://evil.test"><input name="q"></form>',
      p.base,
      p,
      "صلاة",
    ),
    null,
  );
});
test("server search and article reading use source HTML", async () => {
  const results = await searchSource(p, "صلاة", async () =>
    response('<main><a href="/fatwas/123/test">عنوان تجريبي</a></main>'),
  );
  assert.equal(results.length, 1);
  const article = await readSource(p, results[0].id, async () =>
    response(html),
  );
  assert.match(article.answer, /لا يمثل فتوى/);
});
test("external URLs and off-site redirects are blocked before content retrieval", async () => {
  let calls = 0;
  await assert.rejects(
    readSource(p, "//evil.test/fatwas/123", async () => {
      calls++;
      return response(html);
    }),
  );
  assert.equal(calls, 0);
  await assert.rejects(
    sourceHtml(p.base, p, async () =>
      response("", 302, { Location: "https://evil.test/private" }),
    ),
  );
});
test("upstream failures are distinct from an empty search", async () => {
  await assert.rejects(
    searchSource(p, "صلاة", async () => response("blocked", 403)),
  );
  assert.deepEqual(
    await searchSource(p, "صلاة", async () =>
      response("<main>لا توجد نتائج</main>"),
    ),
    [],
  );
});
test("function validates scholar, method and query before any upstream request", async () => {
  assert.equal((await handler({ httpMethod: "POST" })).statusCode, 405);
  assert.equal(
    (
      await handler({
        httpMethod: "GET",
        queryStringParameters: { scholar: "__proto__", q: "صلاة" },
      })
    ).statusCode,
    400,
  );
  assert.equal(
    (
      await handler({
        httpMethod: "GET",
        queryStringParameters: { scholar: "binbaz", q: "" },
      })
    ).statusCode,
    400,
  );
});

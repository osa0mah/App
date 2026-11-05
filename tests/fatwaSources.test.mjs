import test from "node:test";
import assert from "node:assert/strict";
import {
  providers,
  extractSearch,
  extractArticle,
  sourceHtml,
  readSource,
  SourceError,
} from "../server/fatwaSources.mjs";
import { handler, createHandler } from "../netlify/functions/fatwas.mjs";
const p = providers.binbaz;
const body =
  "<html><h1>عنوان اختبار</h1><article><p>هذا نص عربي تجريبي لا يمثل فتوى حقيقية ويستخدم فقط لاختبار استخراج المحتوى.</p><script>bad()</script><nav>قائمة لا تخص النص</nav></article></html>";
const html = (text, status = 200, headers = {}) =>
  new Response(text, {
    status,
    headers: { "Content-Type": "text/html", ...headers },
  });
test("official title parsing preserves result headers and excludes menus, duplicates and off-site links", () => {
  const rows = extractSearch(
    '<header><a href="/fatwas/1/nav">رأس الموقع</a></header><main><article class="search-result"><header><a href="/fatwas/123/test">صلاة الوتر</a></header><a href="/fatwas/123/test">مكرر</a><a href="https://evil.test/fatwas/9">رابط خارجي</a></article></main>',
    p.base,
    p,
    "الوتر",
  );
  assert.deepEqual(
    rows.map((r) => r.id),
    ["/fatwas/123/test"],
  );
});
test("article reading preserves source text and attribution without scripts or menus", async () => {
  const row = await readSource(p, "/fatwas/123/test", async () => html(body));
  assert.equal(row.title, "عنوان اختبار");
  assert.equal(row.scholar, p.name);
  assert.match(row.answer, /نص عربي تجريبي/);
  assert.ok(!row.answer.includes("bad()"));
  assert.ok(!row.answer.includes("قائمة لا تخص النص"));
});
test("audio-only pages report unavailable text rather than fabricated answers", () => {
  assert.throws(
    () =>
      extractArticle(
        '<h1>تسجيل صوتي</h1><audio src="/record.mp3"></audio>',
        p.base + "/fatwas/1",
        p,
      ),
    (e) => e.code === "ARTICLE_PARSE_FAILED",
  );
});
test("off-site URLs and redirects are refused", async () => {
  let calls = 0;
  await assert.rejects(
    readSource(p, "//evil.test/fatwas/1", async () => {
      calls++;
      return html(body);
    }),
  );
  assert.equal(calls, 0);
  await assert.rejects(
    sourceHtml(p.base, p, async () =>
      html("", 302, { Location: "https://evil.test/private" }),
    ),
  );
});
test("endpoint validates scholar, method and query before any index or source access", async () => {
  assert.equal((await handler({ httpMethod: "POST" })).statusCode, 405);
  assert.equal(
    (
      await handler({
        httpMethod: "GET",
        queryStringParameters: { scholar: "__proto__", q: "الصلاة" },
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
test("search and availability use the included catalog, without calling any source search page", async () => {
  let reads = 0;
  const fn = createHandler({
    load: async () => ({
      schemaVersion: 1,
      generatedAt: "2026-11-04T00:00:00Z",
      sources: [{ key: "binbaz", count: 1 }],
      records: [
        {
          provider: "binbaz",
          id: "/fatwas/123/test",
          title: "صلاة الوتر",
          scholar: p.name,
          sourceUrl: p.base + "/fatwas/123/test",
        },
      ],
    }),
    read: async () => {
      reads++;
      throw Error();
    },
  });
  const r = await fn({
    httpMethod: "GET",
    queryStringParameters: { scholar: "binbaz", q: "الوتر" },
  });
  const data = JSON.parse(r.body);
  assert.equal(r.statusCode, 200);
  assert.equal(data.results[0].title, "صلاة الوتر");
  assert.equal(data.catalog.count, 1);
  assert.equal(data.catalog.coverage, "partial");
  assert.equal(reads, 0);
  const unavailable = await fn({
    httpMethod: "GET",
    queryStringParameters: { scholar: "alfawzan", q: "الوتر" },
  });
  assert.equal(unavailable.statusCode, 503);
  assert.equal(JSON.parse(unavailable.body).code, "CATALOG_EMPTY");
  const status = await fn({
    httpMethod: "GET",
    queryStringParameters: { scholar: "binbaz", action: "status" },
  });
  assert.equal(JSON.parse(status.body).catalog.available, true);
});
test("missing generated data is a readiness failure, never an empty search", async () => {
  const fn = createHandler({
    load: async () => {
      throw new SourceError("الفهرس غير جاهز", "CATALOG_NOT_READY");
    },
  });
  const r = await fn({
    httpMethod: "GET",
    queryStringParameters: { scholar: "binbaz", q: "الصلاة" },
  });
  assert.equal(r.statusCode, 503);
  assert.equal(JSON.parse(r.body).code, "CATALOG_NOT_READY");
});

test("expired source certificates report the source-side problem without disabling verification", async () => {
  await assert.rejects(sourceHtml(providers.alfawzan.base, providers.alfawzan, async () => {
    throw new Error("fetch failed", { cause: Object.assign(new Error("certificate expired"), { code: "CERT_HAS_EXPIRED" }) });
  }), error => error.code === "SOURCE_CERTIFICATE_EXPIRED" && /انتهت صلاحية/.test(error.message));
});

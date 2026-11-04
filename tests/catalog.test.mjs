import test from "node:test";
import assert from "node:assert/strict";
import { collectCatalog, robotPolicy } from "../server/catalogBuild.mjs";
import {
  queryCatalog,
  catalogStatus,
  loadCatalog,
} from "../server/fatwaCatalog.mjs";
const html = (body, status = 200) =>
  new Response(body, { status, headers: { "Content-Type": "text/html" } });
const pages = new Map([
  [
    "https://binbaz.org.sa/robots.txt",
    "User-agent: *\nDisallow: /private\nSitemap: https://binbaz.org.sa/sitemap.xml",
  ],
  [
    "https://binbaz.org.sa/",
    '<main><a href="/fatwas/1/وتر">حكم صلاة الوتر</a><a href="https://evil.test/fatwas/9">عنوان خارجي</a></main>',
  ],
  [
    "https://binbaz.org.sa/sitemap.xml",
    '<?xml version="1.0"?><urlset><url><loc>https://binbaz.org.sa/fatwas/2/زكاة</loc></url><url><loc>https://evil.test/private</loc></url></urlset>',
  ],
  [
    "https://binbaz.org.sa/fatwas/1/%D9%88%D8%AA%D8%B1",
    "<h1>حكم صلاة الوتر</h1><article>لا يجب تخزين الجواب في فهرس العناوين</article>",
  ],
  [
    "https://binbaz.org.sa/fatwas/2/%D8%B2%D9%83%D8%A7%D8%A9",
    "<h1>زكاة المال</h1><article>لا يجب تخزين هذا النص أيضًا</article>",
  ],
]);
const fetcher = async (url) =>
  pages.has(url) ? html(pages.get(url)) : html("not found", 404);
test("catalog collects actual official link titles and sitemap page headings without copying answers", async () => {
  const catalog = await collectCatalog({
    fetcher,
    maxPages: 12,
    deadline: Date.now() + 5000,
  });
  const rows = catalog.records.filter((r) => r.provider === "binbaz");
  assert.equal(rows.length, 2);
  assert.ok(
    rows.every((r) => new URL(r.sourceUrl).hostname === "binbaz.org.sa"),
  );
  assert.ok(!JSON.stringify(catalog.records).includes("لا يجب تخزين"));
  assert.ok(!JSON.stringify(catalog.records).includes("evil.test"));
  assert.equal(catalogStatus(catalog, "binbaz").count, 2);
  assert.equal(catalogStatus(catalog, "binbaz").coverage, "partial");
  assert.equal(
    queryCatalog(catalog, "binbaz", "أريد حكم صلاة الوتر")[0].title,
    "حكم صلاة الوتر",
  );
  assert.equal(
    queryCatalog(catalog, "binbaz", "زكاة المال")[0].title,
    "زكاة المال",
  );
  assert.deepEqual(queryCatalog(catalog, "binbaz", "موضوع غير موجود"), []);
  assert.throws(
    () => queryCatalog(catalog, "alfawzan", "الصلاة"),
    (e) => e.code === "CATALOG_EMPTY",
  );
});
test("robots disallow prevents indexing, including direct paths from sitemaps", async () => {
  const requests = [];
  const catalog = await collectCatalog({
    fetcher: async (url) => {
      requests.push(url);
      return html("User-agent: *\nDisallow: /");
    },
    maxPages: 10,
  });
  assert.equal(catalog.records.length, 0);
  assert.ok(catalog.sources.every((s) => s.issues.includes("ROBOTS_DISALLOW")));
  assert.ok(requests.every((u) => u.endsWith("/robots.txt")));
  const policy = robotPolicy(
    "User-agent: *\nDisallow: /private\nAllow: /private/public",
  );
  assert.equal(policy.allowed("/private/a"), false);
  assert.equal(policy.allowed("/private/public/a"), true);
});
test("crawl page budgets and unavailable files never masquerade as a complete empty index", async () => {
  const catalog = await collectCatalog({ fetcher, maxPages: 1 });
  assert.ok(catalog.sources.every((s) => s.pageCount <= 1));
  assert.equal(catalog.coverage, "partial");
  await assert.rejects(
    loadCatalog("/tmp/nonexistent-athar-catalog-checked.json"),
    (e) => e.code === "CATALOG_NOT_READY",
  );
});

test("source readiness explains the blocking reason without asking users for build logs", () => {
  const catalog = {
    schemaVersion: 1,
    generatedAt: "2026-11-04T00:00:00Z",
    sources: [
      {
        key: "alfawzan",
        count: 0,
        pageCount: 0,
        issues: ["ROBOTS_UNAVAILABLE"],
      },
      {
        key: "ibnothaimeen",
        count: 0,
        pageCount: 0,
        issues: ["ROBOTS_DISALLOW"],
      },
    ],
    records: [],
  };
  assert.match(catalogStatus(catalog, "alfawzan").reason, /تعذّر الوصول/);
  assert.match(catalogStatus(catalog, "ibnothaimeen").reason, /تمنع الفهرسة/);
  assert.equal(catalogStatus(catalog, "alfawzan").available, false);
});

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

test("missing robots files include 410 and do not block public title indexing", async () => {
  const { collectProvider } = await import("../server/catalogBuild.mjs");
  const result = await collectProvider("binbaz", {
    maxPages: 1,
    fetcher: async (url) =>
      url.endsWith("/robots.txt")
        ? html("gone", 410)
        : html(
            '<main><a href="/fatwas/123/test">عنوان اختبار للصلاة</a></main>',
          ),
  });
  assert.equal(result.status.robots.state, "missing");
  assert.equal(result.status.robots.code, "HTTP_410");
  assert.equal(result.records.length, 1);
});
test("robots access denials and throttling stop without retrying or fetching other pages", async () => {
  const { collectProvider } = await import("../server/catalogBuild.mjs");
  for (const status of [401, 403, 429]) {
    const requests = [];
    const result = await collectProvider("alfawzan", {
      fetcher: async (url) => {
        requests.push(url);
        return html("blocked", status);
      },
    });
    assert.equal(requests.length, 1);
    assert.ok(requests[0].endsWith("/robots.txt"));
    assert.equal(result.status.robots.code, `HTTP_${status}`);
    assert.equal(result.status.robots.attempts, 1);
    assert.equal(result.status.pageCount, 0);
    assert.equal(result.records.length, 0);
  }
});
test("temporary robots failures get one retry and successful policies are still enforced", async () => {
  const { readRobots } = await import("../server/catalogBuild.mjs");
  const { providers } = await import("../server/fatwaSources.mjs");
  let attempts = 0;
  const result = await readRobots(
    providers.alfawzan,
    async () =>
      ++attempts === 1
        ? html("temporary", 503)
        : html("User-agent: *\nDisallow: /private"),
    Date.now() + 30000,
  );
  assert.equal(attempts, 2);
  assert.equal(result.status.state, "ready");
  assert.equal(result.status.attempts, 2);
  assert.equal(result.policy.allowed("/private/a"), false);
});
test("certificate failures retain verification and publish only a safe failure code", async () => {
  const { readRobots } = await import("../server/catalogBuild.mjs");
  const { providers } = await import("../server/fatwaSources.mjs");
  let attempts = 0;
  const result = await readRobots(
    providers.alfawzan,
    async (_url, options) => {
      attempts++;
      assert.equal(options.agent, undefined);
      assert.equal(options.dispatcher, undefined);
      throw new Error("fetch failed", {
        cause: {
          code: "UNABLE_TO_VERIFY_LEAF_SIGNATURE",
          message: "private-fixture-do-not-report",
        },
      });
    },
    Date.now() + 30000,
  );
  assert.equal(attempts, 1);
  assert.equal(result.policy, null);
  assert.equal(result.status.code, "TLS_VERIFICATION_FAILED");
  assert.equal(result.status.detail, "UNABLE_TO_VERIFY_LEAF_SIGNATURE");
  assert.ok(!JSON.stringify(result.status).includes("private-fixture"));
});
test("redirect diagnostics report the public host without following it or exposing URL credentials", async () => {
  const { readRobots } = await import("../server/catalogBuild.mjs");
  const { providers } = await import("../server/fatwaSources.mjs");
  let attempts = 0;
  const result = await readRobots(
    providers.alfawzan,
    async () => {
      attempts++;
      return new Response("", {
        status: 302,
        headers: {
          Location:
            "https://user:private-fixture@new.example/path?token=private-fixture",
        },
      });
    },
    Date.now() + 30000,
  );
  assert.equal(attempts, 1);
  assert.equal(result.policy, null);
  assert.equal(result.status.code, "REDIRECT_OUTSIDE_SOURCE");
  assert.equal(result.status.redirectHost, "new.example");
  assert.ok(!JSON.stringify(result.status).includes("private-fixture"));
});
test("source status explains the actual robots failure rather than grouping all errors", () => {
  const base = {
    schemaVersion: 1,
    generatedAt: "2026-11-04T00:00:00Z",
    records: [],
  };
  for (const [code, pattern] of [
    ["HTTP_403", /403/],
    ["TLS_VERIFICATION_FAILED", /شهادة/],
    ["TIMEOUT", /مهلة/],
    ["DNS_FAILURE", /اسم نطاق/],
  ]) {
    const value = catalogStatus(
      {
        ...base,
        sources: [
          {
            key: "alfawzan",
            count: 0,
            pageCount: 0,
            issues: ["ROBOTS_UNAVAILABLE"],
            robots: { state: "failed", code },
          },
        ],
      },
      "alfawzan",
    );
    assert.match(value.reason, pattern);
    assert.equal(value.robots.code, code);
  }
});

test('robots Retry-After beyond the build budget is honored without an immediate retry',async()=>{
 const {readRobots}=await import('../server/catalogBuild.mjs');const {providers}=await import('../server/fatwaSources.mjs');let attempts=0;
 const result=await readRobots(providers.alfawzan,async()=>{attempts++;return new Response('maintenance',{status:503,headers:{'Retry-After':'3600'}})},Date.now()+45000);assert.equal(attempts,1);assert.equal(result.policy,null);assert.equal(result.status.code,'HTTP_503');assert.equal(result.status.retryAfterSeconds,3600);
});
test('a persistent robots timeout is retried at most once',async()=>{
 const {readRobots}=await import('../server/catalogBuild.mjs');const {providers}=await import('../server/fatwaSources.mjs');let attempts=0;
 const result=await readRobots(providers.alfawzan,async()=>{attempts++;throw new DOMException('timeout fixture','TimeoutError')},Date.now()+30000);assert.equal(attempts,2);assert.equal(result.policy,null);assert.equal(result.status.code,'TIMEOUT');assert.equal(result.status.attempts,2);
});

test('otherwise unclassified Node network errors keep a safe code without exposing the message',async()=>{
 const {robotsFailure}=await import('../server/catalogBuild.mjs');const result=robotsFailure(new Error('private-fixture',{cause:{code:'UND_ERR_INTERNAL_ERROR',message:'private-fixture'}}));assert.equal(result.code,'NETWORK_FAILURE');assert.equal(result.detail,'UND_ERR_INTERNAL_ERROR');assert.ok(!JSON.stringify(result).includes('private-fixture'));
});

test("page failures retain safe connection diagnostics without query or raw errors", async () => {
  const catalog = await collectCatalog({
    keys: ["alfawzan"],
    fetcher: async (url) => {
      if (url.endsWith("/robots.txt")) return html("User-agent: *\nAllow: /");
      throw Object.assign(new Error("private connection details"), { name: "TimeoutError" });
    },
    deadline: Date.now() + 10000,
    maxPages: 2,
  });
  const source = catalog.sources[0];
  assert.equal(source.pageFailures[0].code, "TIMEOUT");
  assert.equal(source.pageFailures[0].path, "/");
  assert.match(catalogStatus(catalog, "alfawzan").reason, /TIMEOUT/);
  assert.ok(!JSON.stringify(catalog).includes("private connection details"));
});

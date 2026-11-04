import { load } from "cheerio";
import { providers, extractSearch } from "./fatwaSources.mjs";
function safe(value, p) {
  const u = new URL(value, p.base);
  if (
    u.protocol !== "https:" ||
    u.username ||
    u.password ||
    u.port ||
    !p.hosts.includes(u.hostname)
  )
    throw Error("OFFSITE_URL");
  u.hash = "";
  return u;
}
const clean = (s) => s.replace(/\s+/g, " ").trim();
export function robotPolicy(text) {
  let agents = [],
    lastAgent = false;
  let delayMs = 200;
  let explicitDelay = false;
  const rules = [],
    sitemaps = [];
  for (const original of text.split(/\r?\n/)) {
    const line = original.split("#")[0].trim();
    const match = line.match(/^([^:]+):\s*(.*)$/);
    if (!match) continue;
    const key = match[1].toLowerCase(),
      value = match[2].trim();
    if (key === "sitemap") {
      sitemaps.push(value);
      continue;
    }
    if (key === "user-agent") {
      if (!lastAgent) agents = [];
      agents.push(value.toLowerCase());
      lastAgent = true;
      continue;
    }
    lastAgent = false;
    if (
      key === "crawl-delay" &&
      (agents.includes("*") || agents.some((a) => a.includes("atharquran"))) &&
      Number.isFinite(Number(value))
    ) {
      delayMs = Math.max(delayMs, Number(value) * 1000);
      explicitDelay = Number(value) > 0;
    }
    if (
      ["allow", "disallow"].includes(key) &&
      value &&
      (agents.includes("*") || agents.some((a) => a.includes("atharquran")))
    )
      rules.push({ path: value, allow: key === "allow" });
  }
  return {
    sitemaps,
    delayMs,
    concurrency: explicitDelay ? 1 : 2,
    allowed(path) {
      const matches = rules
        .filter((r) => {
          const escaped = r.path
            .replace(/[.+?^${}()|[\]\\]/g, "\\$&")
            .replace(/\*/g, ".*")
            .replace(/\$$/, "$");
          return new RegExp("^" + escaped).test(path);
        })
        .sort(
          (a, b) =>
            b.path.length - a.path.length || Number(b.allow) - Number(a.allow),
        );
      return !matches.length || matches[0].allow;
    },
  };
}
async function document(url, p, fetcher, deadline) {
  let current = safe(url, p);
  for (let i = 0; i < 4; i++) {
    if (Date.now() >= deadline) throw Error("TIME_BUDGET");
    const r = await fetcher(current.href, {
      redirect: "manual",
      signal: AbortSignal.timeout(
        Math.max(1, Math.min(5000, deadline - Date.now())),
      ),
      headers: {
        "User-Agent": "AtharQuran/1.0 (+public-title-index)",
        Accept: "text/html,application/xml,text/xml,text/plain",
      },
    });
    if ([301, 302, 303, 307, 308].includes(r.status)) {
      const next = r.headers.get("location");
      if (!next) throw Error("INVALID_REDIRECT");
      current = safe(new URL(next, current).href, p);
      continue;
    }
    if (!r.ok) throw Error(`HTTP_${r.status}`);
    const content = await r.text();
    if (content.length > 2_000_000) throw Error("DOCUMENT_TOO_LARGE");
    return { text: content, url: current.href };
  }
  throw Error("REDIRECT_LIMIT");
}
export async function collectProvider(
  key,
  { fetcher = fetch, maxPages = 60, deadline = Date.now() + 45000 } = {},
) {
  const p = providers[key];
  if (!p) throw Error("UNKNOWN_PROVIDER");
  const issues = new Set(),
    records = new Map(),
    queue = [],
    seen = new Set();
  let pageCount = 0;
  let policy = robotPolicy("");
  let robots;
  const enqueue = (value) => {
    try {
      const u = safe(value, p);
      if (
        !policy.allowed(u.pathname + u.search) ||
        seen.has(u.href) ||
        queue.includes(u.href) ||
        queue.length >= 4000
      )
        return;
      queue.push(u.href);
    } catch {
      /* Off-site and invalid paths are never crawled. */
    }
  };
  try {
    robots = await document(`${p.base}/robots.txt`, p, fetcher, deadline);
    policy = robotPolicy(robots.text);
  } catch (e) {
    if (e.message !== "HTTP_404") {
      issues.add("ROBOTS_UNAVAILABLE");
      return {
        records: [],
        status: {
          key,
          source: p.name,
          count: 0,
          pageCount: 0,
          coverage: "unavailable",
          issues: [...issues],
        },
      };
    }
  }
  if (!policy.allowed("/"))
    return {
      records: [],
      status: {
        key,
        source: p.name,
        count: 0,
        pageCount: 0,
        coverage: "unavailable",
        issues: ["ROBOTS_DISALLOW"],
      },
    };
  enqueue(p.base);
  if (key === "binbaz")
    for (const n of [1, 2, 3, 4]) enqueue(`${p.base}/fatwas/kind/${n}`);
  for (const sitemap of (policy.sitemaps.length
    ? policy.sitemaps
    : [`${p.base}/sitemap.xml`]
  ).slice(0, 2))
    enqueue(sitemap);
  const add = (url, title, titleOrigin = "link") => {
    try {
      const u = safe(url, p);
      if (
        !p.path.test(u.pathname) ||
        !policy.allowed(u.pathname) ||
        clean(title).length < 5 ||
        /^(?:المزيد|اقرأ المزيد|التفاصيل|قراءة المزيد|استمع|تحميل)$/.test(
          clean(title),
        )
      )
        return;
      if (
        titleOrigin === "link" &&
        records.get(u.pathname)?.titleOrigin === "heading"
      )
        return;
      records.set(u.pathname, {
        provider: key,
        id: u.pathname,
        title: clean(title).slice(0, 220),
        sourceUrl: u.origin + u.pathname,
        scholar: p.name,
        titleOrigin,
      });
    } catch {
      /* Ignore invalid metadata. */
    }
  };
  const visit = async (url) => {
    if (Date.now() >= deadline || pageCount >= maxPages) return;
    seen.add(url);
    pageCount++;
    try {
      const page = await document(url, p, fetcher, deadline);
      const xml = /^\s*(?:<\?xml[^>]*>\s*)?<(?:sitemapindex|urlset)\b/i.test(
        page.text,
      );
      if (xml) {
        const $ = load(page.text, { xmlMode: true });
        $("loc").each((_, loc) => {
          const value = $(loc).text();
          let u;
          try {
            u = safe(value, p);
          } catch {
            return;
          }
          if (
            p.path.test(u.pathname) ||
            /\.xml(?:$|\?)/.test(u.pathname) ||
            /sitemap/i.test(u.pathname)
          )
            enqueue(u.href);
        });
        return;
      }
      const $ = load(page.text);
      if (
        /just a moment|access denied|captcha|attention required/i.test(
          $("title").text(),
        )
      ) {
        issues.add("SOURCE_CHALLENGE");
        return;
      }
      if (p.path.test(new URL(page.url).pathname))
        add(page.url, $("h1").first().text(), "heading");
      for (const row of extractSearch(page.text, page.url, p))
        add(row.sourceUrl, row.title);
      $("script,style,footer,aside").remove();
      $("a[href]").each((_, a) => {
        let u;
        try {
          u = safe(new URL($(a).attr("href"), page.url).href, p);
        } catch {
          return;
        }
        if (
          p.path.test(u.pathname) ||
          /\/fatwas\/kind\//.test(u.pathname) ||
          /(^|\s)next(\s|$)/.test($(a).attr("rel")||"") ||
          (u.pathname===new URL(page.url).pathname&&u.searchParams.has("page")&&!p.path.test(u.pathname)) ||
          /فتاوى|فتوى/.test(clean($(a).text()))
        )
          enqueue(u.href);
      });
    } catch (e) {
      issues.add(
        ["HTTP_403", "HTTP_429"].includes(e.message)
          ? "SOURCE_ACCESS_DENIED"
          : e.message === "TIME_BUDGET"
            ? "TIME_BUDGET"
            : "PAGE_UNAVAILABLE",
      );
    }
  };
  while (queue.length && pageCount < maxPages && Date.now() < deadline) {
    const batch = [];
    while (
      queue.length &&
      batch.length < policy.concurrency &&
      pageCount + batch.length < maxPages
    ) {
      const u = queue.shift();
      if (!seen.has(u)) batch.push(u);
    }
    if (!batch.length) break;
    await Promise.all(batch.map(visit));
    if (queue.length && Date.now() + policy.delayMs < deadline)
      await new Promise((r) => setTimeout(r, policy.delayMs));
    else if (queue.length && Date.now() + policy.delayMs >= deadline) break;
  }
  if (queue.length) issues.add("PARTIAL_CRAWL");
  return {
    records: [...records.values()],
    status: {
      key,
      source: p.name,
      count: records.size,
      pageCount,
      coverage: records.size ? "partial" : "unavailable",
      issues: [...issues],
    },
  };
}
export async function collectCatalog(options = {}) {
  const all = await Promise.all(
    Object.keys(providers).map((key) => collectProvider(key, options)),
  );
  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    coverage: "partial",
    sources: all.map((x) => x.status),
    records: all.flatMap((x) => x.records),
  };
}

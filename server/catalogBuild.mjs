import { load } from "cheerio";
import { readSourceBody, SOURCE_PAGE_BYTES, SOURCE_SITEMAP_BYTES } from "./sourceBody.mjs";
import { providers, extractSearch, uthaymeenLesson } from "./fatwaSources.mjs";
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
async function document(url, p, fetcher, deadline, timeoutMs = 12000) {
  let current = safe(url, p);
  for (let i = 0; i < 4; i++) {
    if (Date.now() >= deadline) throw Error("TIME_BUDGET");
    const r = await fetcher(current.href, {
      redirect: "manual",
      signal: AbortSignal.timeout(
        Math.max(1, Math.min(timeoutMs, deadline - Date.now())),
      ),
      headers: {
        "User-Agent": "AtharQuran/1.0 (+public-title-index)",
        Accept: "text/html,application/xml,text/xml,text/plain",
      },
    });
    if ([301, 302, 303, 307, 308].includes(r.status)) {
      await r.body?.cancel();
      const next = r.headers.get("location");
      if (!next) throw Error("INVALID_REDIRECT");
      const target = new URL(next, current);
      try {
        current = safe(target.href, p);
      } catch {
        const error = new Error("OFFSITE_URL");
        error.redirectHost = target.hostname;
        throw error;
      }
      continue;
    }
    if (!r.ok) {
      const error = new Error(`HTTP_${r.status}`);
      const header = r.headers.get("retry-after");
      if (header) {
        const seconds = /^\d+$/.test(header)
          ? Number(header)
          : Math.ceil((Date.parse(header) - Date.now()) / 1000);
        if (Number.isFinite(seconds))
          error.retryAfterSeconds = Math.max(0, Math.min(86400, seconds));
      }
      await r.body?.cancel();
      throw error;
    }
    const content = await readSourceBody(
      r, current.pathname === "/robots.txt" ? 1024 * 1024
        : /sitemap|\.xml$/i.test(current.pathname) ? SOURCE_SITEMAP_BYTES : undefined,
    );
    return { text: content, url: current.href, status: r.status };
  }
  throw Error("REDIRECT_LIMIT");
}
export function robotsFailure(error) {
  const codes = [];
  let current = error;
  for (let i = 0; current && i < 4; i++, current = current.cause) {
    if (
      typeof current.code === "string" &&
      /^[A-Z0-9_]{1,70}$/.test(current.code)
    )
      codes.push(current.code);
    if (Array.isArray(current.errors))
      for (const e of current.errors.slice(0, 3))
        if (typeof e.code === "string" && /^[A-Z0-9_]{1,70}$/.test(e.code))
          codes.push(e.code);
  }
  if (/^HTTP_\d{3}$/.test(error.message))
    return {
      state: "failed",
      code: error.message,
      ...(error.retryAfterSeconds !== undefined
        ? { retryAfterSeconds: error.retryAfterSeconds }
        : {}),
    };
  if (
    ["REDIRECT_LIMIT", "INVALID_REDIRECT", "DOCUMENT_TOO_LARGE"].includes(
      error.message,
    )
  )
    return { state: "failed", code: error.message };
  if (error.message === "OFFSITE_URL")
    return {
      state: "failed",
      code: "REDIRECT_OUTSIDE_SOURCE",
      ...(error.redirectHost ? { redirectHost: error.redirectHost } : {}),
    };
  const tls = codes.find((c) =>
    /CERT|TLS|SSL|SELF_SIGNED|UNABLE_TO_VERIFY/.test(c),
  );
  if (tls)
    return { state: "failed", code: "TLS_VERIFICATION_FAILED", detail: tls };
  if (
    ["TimeoutError", "AbortError"].includes(error.name) ||
    error.message === "TIME_BUDGET" ||
    codes.some((c) => /TIMEOUT|TIMEDOUT/.test(c))
  )
    return { state: "failed", code: "TIMEOUT" };
  const dns = codes.find((c) => ["ENOTFOUND", "EAI_AGAIN"].includes(c));
  if (dns) return { state: "failed", code: "DNS_FAILURE", detail: dns };
  const network = codes.find((c) => /ECONN|ENET|EHOST|UND_ERR_SOCKET/.test(c));
  return {
    state: "failed",
    code: "NETWORK_FAILURE",
    ...(network || codes[0] ? { detail: network || codes[0] } : {}),
  };
}
export async function readRobots(provider, fetcher, deadline) {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const page = await document(
        `${provider.base}/robots.txt`,
        provider,
        fetcher,
        deadline,
        12000,
      );
      return {
        policy: robotPolicy(page.text),
        status: {
          state: "ready",
          code: `HTTP_${page.status}`,
          attempts: attempt + 1,
        },
      };
    } catch (error) {
      const status = { ...robotsFailure(error), attempts: attempt + 1 };
      if (["HTTP_404", "HTTP_410"].includes(status.code))
        return {
          policy: robotPolicy(""),
          status: { ...status, state: "missing" },
        };
      const transient =
        [
          "HTTP_408",
          "HTTP_500",
          "HTTP_502",
          "HTTP_503",
          "HTTP_504",
          "TIMEOUT",
        ].includes(status.code) ||
        (status.code === "DNS_FAILURE" && status.detail === "EAI_AGAIN") ||
        (status.code === "NETWORK_FAILURE" && status.detail === "ECONNRESET");
      const retryDelay = Math.max(300, (status.retryAfterSeconds || 0) * 1000);
      if (
        attempt === 0 &&
        transient &&
        Date.now() + retryDelay + 12000 < deadline
      ) {
        await new Promise((resolve) => setTimeout(resolve, retryDelay));
        continue;
      }
      return { policy: null, status };
    }
  }
}
export async function collectProvider(
  key,
  { fetcher = fetch, maxPages = 60, deadline = Date.now() + 45000, listingOnly = false, continuations = {}, onProgress } = {},
) {
  const p = providers[key];
  if (!p) throw Error("UNKNOWN_PROVIDER");
  const pageFailures = [];
  const lessonIds = new Set();
  const deferred = new Set();
  const issues = new Set(),
    records = new Map(),
    queue = [],
    seen = new Set();
  let pageCount = 0;
  let policy = robotPolicy("");
  let robotsStatus;
  const enqueue = (value) => {
    try {
      const u = safe(value, p);
      if (
        (listingOnly && key === "binbaz" && p.path.test(u.pathname)) ||
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
  const robots = await readRobots(p, fetcher, deadline);
  robotsStatus = robots.status;
  if (!robots.policy) {
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
        robots: robotsStatus,
      },
    };
  }
  policy = robots.policy;
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
        robots: robotsStatus,
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
  for (const path of (continuations[key] || []).slice(0, 4000)) enqueue(path);
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
        // Process bounded loc elements without allocating a DOM for a large sitemap.
        for (const match of page.text.matchAll(/<loc\b[^>]*>([^<]{1,8000})<\/loc>/gi)) {
          const value = match[1].replace(/&amp;/g, "&").trim();
          let u;
          try {
            u = safe(value, p);
          } catch {
            continue;
          }
          const lesson = key === "ibnothaimeen" ? uthaymeenLesson(u.pathname) : null;
          if (lesson) {
            if (!lessonIds.has(lesson.id)) { add(u.href, lesson.title, "sitemap"); lessonIds.add(lesson.id); }
            continue;
          }
          if (
            p.path.test(u.pathname) ||
            /\.xml(?:$|\?)/.test(u.pathname) ||
            /sitemap/i.test(u.pathname)
          )
            enqueue(u.href);
        }
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
          /(^|\s)next(\s|$)/.test($(a).attr("rel") || "") ||
          (u.pathname === new URL(page.url).pathname &&
            u.searchParams.has("page") &&
            !p.path.test(u.pathname)) ||
          /فتاوى|فتوى/.test(clean($(a).text()))
        )
          enqueue(u.href);
      });
    } catch (e) {
      if (key === "binbaz" && /^\/fatwas\/kind\/[1-4]$/.test(new URL(url).pathname) && !["HTTP_404", "HTTP_410"].includes(e.message)) deferred.add(url);
      if (pageFailures.length < 3)
        pageFailures.push({ path: new URL(url).pathname, ...robotsFailure(e) });
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
    onProgress?.({ key, pageCount, count: records.size, queued: queue.length, records: records.values() });
    if (queue.length && Date.now() + policy.delayMs < deadline)
      await new Promise((r) => setTimeout(r, policy.delayMs));
    else if (queue.length && Date.now() + policy.delayMs >= deadline) break;
  }
  if (queue.length || deferred.size) issues.add("PARTIAL_CRAWL");
  return {
    records: [...records.values()],
    status: {
      key,
      source: p.name,
      count: records.size,
      pageCount,
      coverage: records.size ? "partial" : "unavailable",
      issues: [...issues],
      pageFailures,
      pendingPaths: key === "binbaz" ? [...new Set([...queue, ...deferred])].map(value => { const u = new URL(value); return u.pathname + u.search; }) : [],
      robots: robotsStatus,
    },
  };
}
export async function collectCatalog(options = {}) {
  const all = await Promise.all(
    (options.keys || Object.keys(providers))
      .filter((key) => Object.hasOwn(providers, key))
      .map((key) => collectProvider(key, options)),
  );
  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    coverage: "partial",
    sources: all.map((x) => ({ ...x.status, bodyLimitBytes: SOURCE_PAGE_BYTES, sitemapLimitBytes: SOURCE_SITEMAP_BYTES })),
    records: all.flatMap((x) => x.records),
  };
}

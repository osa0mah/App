import { load } from "cheerio";
import { relevance, searchTopic } from "./searchText.mjs";
export const providers = {
  binbaz: {
    name: "عبد العزيز بن باز",
    base: "https://binbaz.org.sa",
    hosts: ["binbaz.org.sa", "www.binbaz.org.sa"],
    path: /^\/fatwas\/\d+(?:\/|$)/,
    search: (q) => `https://binbaz.org.sa/search?q=${encodeURIComponent(q)}`,
  },
  alfawzan: {
    name: "صالح الفوزان",
    base: "https://www.alfawzan.af.org.sa",
    hosts: ["www.alfawzan.af.org.sa", "alfawzan.af.org.sa"],
    path: /^\/(?:ar\/)?node\/\d+\/?$/,
    search: (q) =>
      `https://www.alfawzan.af.org.sa/ar/search/node?keys=${encodeURIComponent(q)}`,
  },
  ibnothaimeen: {
    name: "محمد بن صالح العثيمين",
    base: "https://binothaimeen.net",
    hosts: ["binothaimeen.net", "www.binothaimeen.net"],
    path: /^\/content\/\d+(?:\/|$)/,
  },
};
export class SourceError extends Error {
  constructor(message, code = "SOURCE_UNAVAILABLE") {
    super(message);
    this.code = code;
  }
}
function allowedUrl(value, provider) {
  const u = new URL(value, provider.base);
  if (
    u.protocol !== "https:" ||
    u.username ||
    u.password ||
    u.port ||
    !provider.hosts.includes(u.hostname)
  )
    throw new SourceError("عنوان المصدر غير مسموح.");
  return u;
}
export async function sourceHtml(url, provider, fetcher = fetch, init = {}) {
  const cookies = new Map();
  let method = init.method || "GET";
  let requestBody = init.body;
  let current = allowedUrl(url, provider);
  for (let attempt = 0; attempt < 4; attempt++) {
    let response;
    try {
      response = await fetcher(current.href, {
        redirect: "manual",
        method,
        ...(method === "POST" ? { body: requestBody } : {}),
        signal: AbortSignal.timeout(7000),
        headers: {
          Accept: "text/html",
          "User-Agent": "AtharQuran/1.0 (+public-source-reader)",
          ...(method === "POST"
            ? { "Content-Type": "application/x-www-form-urlencoded" }
            : {}),
          ...(init.cookie || cookies.size
            ? {
                Cookie: [init.cookie, ...cookies.values()]
                  .filter(Boolean)
                  .join("; "),
              }
            : {}),
        },
      });
    } catch {
      throw new SourceError("تعذّر الاتصال بموقع الشيخ. حاول مجددًا لاحقًا.");
    }
    for (const value of response.headers.getSetCookie?.() || []) {
      const pair = value.split(";")[0];
      cookies.set(pair.split("=")[0], pair);
    }
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      if (
        response.status === 303 ||
        ([301, 302].includes(response.status) && method === "POST")
      ) {
        method = "GET";
        requestBody = undefined;
      }
      const location = response.headers.get("location");
      if (!location) throw new SourceError("تحويل غير صالح من المصدر.");
      current = allowedUrl(new URL(location, current).href, provider);
      continue;
    }
    if (!response.ok)
      throw new SourceError(
        "موقع الشيخ لم يسمح بجلب المحتوى حاليًا. حاول لاحقًا.",
      );
    const type = response.headers.get("content-type") || "";
    if (!type.includes("text/html") && !type.includes("application/xhtml+xml"))
      throw new SourceError("المصدر لم يُرجع صفحة نصية يمكن قراءتها.");
    const body = await response.text();
    if (body.length > 2_000_000)
      throw new SourceError("صفحة المصدر أكبر من الحد المتاح.");
    const title = load(body)("title").text();
    if (/just a moment|access denied|captcha|attention required/i.test(title))
      throw new SourceError(
        "المصدر يطلب تحققًا إضافيًا ولا يسمح بقراءة البحث آليًا حاليًا.",
        "SOURCE_CHALLENGE",
      );
    return {
      html: body,
      url: current.href,
      cookie: [init.cookie, ...cookies.values()].filter(Boolean).join("; "),
    };
  }
  throw new SourceError("تعذّر إكمال التحويل إلى صفحة المصدر.");
}
const clean = (s) =>
  s
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
export function extractSearch(html, url, provider, query = "") {
  const $ = load(html);
  const result = [];
  const seen = new Set();
  $("nav,aside,body > header,header[role=banner],.site-header,footer,.breadcrumb,.related,.related-posts").remove();
  const containers = $(
    ".search-results,.search-result,.view-content,.search-content",
  );
  const root = containers.length
    ? containers
    : $("main").length
      ? $("main")
      : $("body");
  root
    .filter("a[href]")
    .add(root.find("a[href]"))
    .each((_, a) => {
      const title = clean($(a).text());
      if (title.length < 5) return;
      let link;
      try {
        link = allowedUrl(new URL($(a).attr("href"), url).href, provider);
      } catch {
        return;
      }
      if (!provider.path.test(link.pathname) || seen.has(link.pathname)) return;
      seen.add(link.pathname);
      result.push({
        id: link.pathname,
        title: title.slice(0, 220),
        sourceUrl: link.href,
        scholar: provider.name,
        snippet: clean(
          $(a).closest("article,.search-result,.result,.views-row,li").text(),
        ).slice(0, 600),
      });
    });
  return result
    .sort(
      (a, b) =>
        relevance(`${b.title} ${b.snippet}`, query) -
        relevance(`${a.title} ${a.snippet}`, query),
    )
    .slice(0, 20);
}
export function discoverSearchRequest(html, url, provider, query) {
  const $ = load(html);
  let endpoint = null;
  $("form").each((_, form) => {
    if (endpoint) return;
    const el = $(form);
    const method = (el.attr("method") || "get").toUpperCase();
    if (
      !["GET", "POST"].includes(method) ||
      el.find('input[type="password"]').length
    )
      return;
    const input = el
      .find(
        'input[type="search"],input[name="q"],input[name="s"],input[name="keys"],input[name="search"],input[name="query"],input[name="keyword"],input[name="search_api_fulltext"]',
      )
      .first();
    if (!input.length || !input.attr("name")) return;
    if (
      method === "POST" &&
      !/search|بحث/i.test(el.attr("action") || "") &&
      el.attr("role") !== "search" &&
      input.attr("type") !== "search" &&
      !/بحث|ابحث/.test(el.text()) &&
      !["keys", "search", "search_api_fulltext"].includes(input.attr("name"))
    )
      return;
    try {
      const u = allowedUrl(
        new URL(el.attr("action") || url, url).href,
        provider,
      );
      const params = new URLSearchParams();
      el.find(
        'input[type="hidden"][name],button[type="submit"][name],input[type="submit"][name]',
      ).each((_, hidden) =>
        params.set($(hidden).attr("name"), $(hidden).attr("value") || ""),
      );
      params.set(input.attr("name"), query);
      if (method === "GET") {
        for (const [k, v] of params) u.searchParams.set(k, v);
        endpoint = { url: u.href, method };
      } else endpoint = { url: u.href, method, body: params.toString() };
    } catch {
      /* Never submit off-site forms. */
    }
  });
  return endpoint;
}
export function discoverSearch(html, url, provider, query) {
  const request = discoverSearchRequest(html, url, provider, query);
  return request?.method === "GET" ? request.url : null;
}
export async function searchSource(provider, query, fetcher = fetch) {
  const topic = searchTopic(query);
  if (!topic)
    throw new SourceError(
      "اكتب موضوع الفتوى، مثل صلاة الوتر أو زكاة المال.",
      "QUERY_TOO_BROAD",
    );
  const home = await sourceHtml(provider.base, provider, fetcher);
  let request = discoverSearchRequest(home.html, home.url, provider, topic);
  let cookie = home.cookie;
  if (!request) {
    const $ = load(home.html);
    const links = $("a[href]")
      .toArray()
      .map((a) => $(a).attr("href"))
      .filter((h) => h && /search|بحث/.test(h));
    for (const link of links.slice(0, 1)) {
      try {
        const page = await sourceHtml(
          new URL(link, home.url).href,
          provider,
          fetcher,
          { cookie },
        );
        request = discoverSearchRequest(page.html, page.url, provider, topic);
        cookie = page.cookie;
      } catch (error) {
        if (!(error instanceof SourceError)) throw error;
      }
    }
  }
  if (!request && provider.search)
    request = { url: provider.search(topic), method: "GET" };
  if (!request)
    throw new SourceError(
      "لم نتمكن من قراءة نموذج البحث لهذا المصدر؛ هذا لا يعني عدم وجود فتاوى.",
      "SEARCH_UNSUPPORTED",
    );
  const page = await sourceHtml(request.url, provider, fetcher, {
    ...request,
    cookie,
  });
  const results = extractSearch(page.html, page.url, provider, topic);
  if (results.length) return results;
  const document = load(page.html);
  document(
    'script,style,template,noscript,[hidden],[style*="display:none"],[style*="display: none"]',
  ).remove();
  const visible = document("body").text();
  if (
    /لا توجد نتائج|لم (?:يتم العثور|نعثر|يعثر)|لا يوجد نتائج|لم نجد نتائج|no results|no matching/i.test(
      visible,
    )
  )
    return [];
  throw new SourceError(
    "تعذّر قراءة نتائج البحث من موقع الشيخ. لم نتحقق من خلو النتائج؛ جرّب لاحقًا.",
    "SEARCH_PARSE_FAILED",
  );
}
export function extractArticle(html, url, provider) {
  const source = allowedUrl(url, provider);
  if (!provider.path.test(source.pathname))
    throw new SourceError("الرابط ليس صفحة محتوى معتمدة لهذا المصدر.");
  const $ = load(html);
  $(
    "script,style,nav,footer,form,aside,.breadcrumb,.breadcrumbs,.share,.social-share,.related,.related-posts,.comments",
  ).remove();
  const title = clean($("h1").first().text());
  let answer = "";
  const selectors = [
    '[itemprop="articleBody"]',
    ".fatwa-body",
    ".fatwa-content",
    ".article-content",
    ".article-body",
    ".field--name-body",
    ".field-name-body",
    ".entry-content",
    ".post-content",
    "article",
  ];
  for (const selector of selectors) {
    const el = $(selector).first().clone();
    if (!el.length) continue;
    el.find("h1").remove();
    el.find("br").replaceWith("\n");
    el.find("p,div,li,h2,h3").append("\n");
    const text = clean(el.text());
    if (text.length >= 40 && /[\u0621-\u064A]/.test(text)) {
      answer = text;
      break;
    }
  }
  if (!title || !answer)
    throw new SourceError(
      "لم نتمكن من استخراج النص الأصلي لهذه الصفحة. قد تكون صوتية فقط أو تغيّر تنسيق المصدر.",
    );
  return {
    id: source.pathname,
    scholar: provider.name,
    title,
    question: "",
    answer,
    sourceUrl: source.href,
    retrievedAt: new Date().toISOString().slice(0, 10),
  };
}
export async function readSource(provider, path, fetcher = fetch) {
  if (
    typeof path !== "string" ||
    !path.startsWith("/") ||
    path.startsWith("//") ||
    !provider.path.test(path.split("?")[0])
  )
    throw new SourceError("رابط الفتوى غير صالح.");
  const url = allowedUrl(path, provider);
  const page = await sourceHtml(url.href, provider, fetcher);
  return extractArticle(page.html, page.url, provider);
}

import { load } from "cheerio";
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
export class SourceError extends Error {}
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
export async function sourceHtml(url, provider, fetcher = fetch) {
  let current = allowedUrl(url, provider);
  for (let attempt = 0; attempt < 4; attempt++) {
    let response;
    try {
      response = await fetcher(current.href, {
        redirect: "manual",
        signal: AbortSignal.timeout(7000),
        headers: {
          Accept: "text/html",
          "User-Agent": "AtharQuran/1.0 (+public-source-reader)",
        },
      });
    } catch {
      throw new SourceError("تعذّر الاتصال بموقع الشيخ. حاول مجددًا لاحقًا.");
    }
    if ([301, 302, 303, 307, 308].includes(response.status)) {
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
    if (!type.includes("text/html"))
      throw new SourceError("المصدر لم يُرجع صفحة نصية يمكن قراءتها.");
    const body = await response.text();
    if (body.length > 2_000_000)
      throw new SourceError("صفحة المصدر أكبر من الحد المتاح.");
    return { html: body, url: current.href };
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
export function extractSearch(html, url, provider) {
  const $ = load(html);
  const result = [];
  const seen = new Set();
  $("nav,aside,header,footer,.breadcrumb,.related,.related-posts").remove();
  const containers = $(
    ".search-results,.search-result,.view-content,.search-content",
  );
  const root = containers.length
    ? containers
    : $("main").length
      ? $("main")
      : $("body");
  root.find("a[href]").each((_, a) => {
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
    });
  });
  return result.slice(0, 20);
}
export function discoverSearch(html, url, provider, query) {
  const $ = load(html);
  let endpoint = null;
  $("form").each((_, form) => {
    if (endpoint) return;
    const el = $(form);
    if ((el.attr("method") || "get").toLowerCase() !== "get") return;
    const input = el
      .find(
        'input[type="search"],input[name="q"],input[name="keys"],input[name="search"],input[name="query"],input[name="keyword"],input[name="search_api_fulltext"]',
      )
      .first();
    if (!input.length || !input.attr("name")) return;
    try {
      const u = allowedUrl(
        new URL(el.attr("action") || url, url).href,
        provider,
      );
      el.find('input[type="hidden"][name]').each((_, hidden) => {
        u.searchParams.set(
          $(hidden).attr("name"),
          $(hidden).attr("value") || "",
        );
      });
      u.searchParams.set(input.attr("name"), query);
      endpoint = u.href;
    } catch {
      /* Ignore off-site forms. */
    }
  });
  return endpoint;
}
export async function searchSource(provider, query, fetcher = fetch) {
  let endpoint = provider.search?.(query);
  if (!endpoint) {
    const home = await sourceHtml(provider.base, provider, fetcher);
    endpoint = discoverSearch(home.html, home.url, provider, query);
    if (!endpoint) {
      const $ = load(home.html);
      const link = $("a[href]")
        .toArray()
        .map((a) => $(a).attr("href"))
        .find((h) => h && /search|بحث/.test(h));
      if (link) {
        const page = await sourceHtml(
          new URL(link, home.url).href,
          provider,
          fetcher,
        );
        endpoint = discoverSearch(page.html, page.url, provider, query);
      }
    }
  }
  if (!endpoint)
    throw new SourceError(
      "لم نتمكن من ربط البحث النصي لهذا المصدر بعد. جرّب شيخًا آخر حاليًا.",
    );
  const page = await sourceHtml(endpoint, provider, fetcher);
  return extractSearch(page.html, page.url, provider);
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

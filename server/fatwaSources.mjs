import { load } from "cheerio";
import { readSourceBody } from "./sourceBody.mjs";
import { relevance } from "./searchText.mjs";
export const providers = {
  binbaz: {
    name: "عبد العزيز بن باز",
    base: "https://binbaz.org.sa",
    hosts: ["binbaz.org.sa", "www.binbaz.org.sa"],
    path: /^\/fatwas\/\d+(?:\/|$)/,
  },
  alfawzan: {
    name: "صالح الفوزان",
    base: "https://www.alfawzan.af.org.sa",
    hosts: ["www.alfawzan.af.org.sa", "alfawzan.af.org.sa"],
    path: /^\/(?:ar\/)?node\/\d+\/?$/,
  },
  ibnothaimeen: {
    name: "محمد بن صالح العثيمين",
    base: "https://binothaimeen.net",
    hosts: ["binothaimeen.net", "www.binothaimeen.net"],
    path: /^(?:\/content\/\d+(?:\/|$)|\/ar\/voice_library\/lessonDetails\/[^/]+\/[^/]+\/[a-f0-9-]{36}\/?$)/i,
  },
};
export class SourceError extends Error {
  constructor(message, code = "SOURCE_UNAVAILABLE", diagnostics = undefined) {
    super(message);
    this.code = code;
    this.diagnostics = diagnostics;
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
    let body;
    try {
      body = await readSourceBody(response);
    } catch (error) {
      if (error.message === "DOCUMENT_TOO_LARGE")
        throw new SourceError("صفحة المصدر أكبر من الحد المتاح.", "DOCUMENT_TOO_LARGE");
      throw new SourceError("تعذّرت قراءة صفحة المصدر. حاول مجددًا لاحقًا.");
    }
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
  $(
    "nav,aside,body > header,header[role=banner],.site-header,footer,.breadcrumb,.related,.related-posts",
  ).remove();
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
export function inspectSearchPage(html, url, provider) {
  const $ = load(html);
  const page = allowedUrl(url, provider);
  const links = [];
  const seen = new Set();
  $("a[href]").each((_, a) => {
    let u;
    try {
      u = allowedUrl(new URL($(a).attr("href"), page).href, provider);
    } catch {
      return;
    }
    if (seen.has(u.pathname)) return;
    seen.add(u.pathname);
    links.push({
      path: u.pathname.slice(0, 180),
      title: clean($(a).text()).slice(0, 100),
    });
  });
  const forms = $("form")
    .toArray()
    .slice(0, 6)
    .map((form) => {
      const el = $(form);
      let action = null;
      try {
        action = allowedUrl(
          new URL(el.attr("action") || page.href, page).href,
          provider,
        ).pathname;
      } catch {
        /* no offsite form details */
      }
      return {
        method: (el.attr("method") || "GET").toUpperCase(),
        action,
        fields: el
          .find("input[name]")
          .toArray()
          .map((i) => $(i).attr("name"))
          .filter(
            (n) =>
              /^[a-zA-Z0-9_\[\]-]{1,60}$/.test(n) &&
              !/token|csrf|password|session|auth/i.test(n),
          )
          .slice(0, 12),
      };
    });
  return {
    source: provider.name,
    pagePath: page.pathname,
    title: clean($("title").text()).slice(0, 180),
    formCount: $("form").length,
    forms,
    linkCount: $("a[href]").length,
    contentLinkCount: links.filter((l) => provider.path.test(l.path)).length,
    sampleLinks: links
      .filter((l) => /fat|content|node|search|بحث|فتوى/i.test(l.path))
      .concat(
        links.filter((l) => !/fat|content|node|search|بحث|فتوى/i.test(l.path)),
      )
      .slice(0, 12),
    scriptCount: $("script").length,
    hasClientRoot: $("#app,#root,#__next").length > 0,
  };
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
      "ARTICLE_PARSE_FAILED",
      inspectSearchPage(html, url, provider),
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
export function uthaymeenLesson(path) {
  const match = path.match(/^\/ar\/voice_library\/lessonDetails\/[^/]+\/([^/]+)\/([a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12})\/?$/i);
  if (!match) return null;
  try { return { id: match[2], title: decodeURIComponent(match[1]).trim() }; }
  catch { return null; }
}
async function readUthaymeenLesson(path, provider, fetcher) {
  const lesson = uthaymeenLesson(path);
  if (!lesson) throw new SourceError("رابط الفتوى غير صالح.");
  const endpoint = `https://shekhapi.binothaimeen.net/lessons/audios/show/${lesson.id}/0/1?getManySectionsWithAllParent=audio_library&getAllPaths=1`;
  let response;
  try {
    response = await fetcher(endpoint, {
      redirect: "error", signal: AbortSignal.timeout(12000),
      headers: { Accept: "application/json", "User-Agent": "AtharQuran/1.0 (+public-source-reader)" },
    });
  } catch { throw new SourceError("تعذّر الاتصال بواجهة المحتوى الرسمية للشيخ."); }
  if (!response.ok || !/application\/json/i.test(response.headers.get("content-type") || "")) {
    await response.body?.cancel();
    throw new SourceError("واجهة المحتوى الرسمية لم تُرجع نص الفتوى.");
  }
  let data;
  try { data = JSON.parse(await readSourceBody(response)).data; }
  catch { throw new SourceError("تعذّرت قراءة استجابة المصدر الرسمية."); }
  if (data?.id !== lesson.id || data.type !== "audios")
    throw new SourceError("استجابة المصدر لا تطابق الفتوى المطلوبة.");
  const title = data.title?.ar;
  const html = data.objective?.content?.ar;
  if (typeof title !== "string" || typeof html !== "string" || data.objective?.text_display === false)
    throw new SourceError("لا يتوفر نص منشور لهذه المادة لدى المصدر.", "ARTICLE_PARSE_FAILED");
  const $ = load(html);
  $("script,style,iframe,form").remove();
  $("p,div,br").append("\n");
  const answer = $.root().text().replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
  if (!answer) throw new SourceError("لا يتوفر نص منشور لهذه المادة لدى المصدر.", "ARTICLE_PARSE_FAILED");
  return { id: path, scholar: provider.name, title: title.trim(), question: "", answer,
    sourceUrl: new URL(path, provider.base).href, retrievedAt: new Date().toISOString().slice(0,10) };
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
  if (provider === providers.ibnothaimeen && uthaymeenLesson(url.pathname))
    return readUthaymeenLesson(url.pathname, provider, fetcher);
  const page = await sourceHtml(url.href, provider, fetcher);
  return extractArticle(page.html, page.url, provider);
}

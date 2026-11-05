import { readFile, stat } from "node:fs/promises";
import { resolve } from "node:path";
import { providers, SourceError } from "./fatwaSources.mjs";
import {
  relevance,
  searchTopic,
  topicTerms,
  normalizeSearch,
} from "./searchText.mjs";
let memo = null;
let memoStamp = null;
export async function loadCatalog(
  path = resolve(process.cwd(), "generated/fatwa-catalog.json"),
) {
  try {
    const info = await stat(path);
    const key = `${path}:${info.mtimeMs}`;
    if (memoStamp === key) return memo;
    const value = JSON.parse(await readFile(path, "utf8"));
    if (
      value.schemaVersion !== 1 ||
      !Array.isArray(value.records) ||
      !Array.isArray(value.sources)
    )
      throw Error("INVALID_SCHEMA");
    memo = value;
    memoStamp = key;
    return value;
  } catch {
    throw new SourceError(
      "فهرس الفتاوى غير جاهز في هذا النشر. يلزم إكمال بنائه من الصفحات الرسمية.",
      "CATALOG_NOT_READY",
    );
  }
}
export function catalogStatus(catalog, key) {
  const source = catalog.sources.find((s) => s.key === key);
  const count = catalog.records.filter((r) => r.provider === key).length;
  const issues = source?.issues || [];
  let reason = null;
  if (!count) {
    if (issues.includes("ROBOTS_DISALLOW"))
      reason = "تعليمات المصدر تمنع الفهرسة الآلية.";
    else if (issues.includes("ROBOTS_UNAVAILABLE")) {
      const code = source?.robots?.code;
      const messages = {
        HTTP_408: "خادم المصدر أنهى طلب robots.txt بسبب المهلة (HTTP 408).",
        REDIRECT_LIMIT: "تكررت تحويلات ملف robots.txt أكثر من الحد المسموح.",
        INVALID_REDIRECT: "المصدر أعاد تحويلًا غير صالح لملف robots.txt.",
        DOCUMENT_TOO_LARGE: "استجابة robots.txt أكبر من حد القراءة المسموح.",
        HTTP_401: "طلب ملف robots.txt يتطلب صلاحية وصول (HTTP 401).",
        HTTP_403: "رُفض طلب ملف robots.txt (HTTP 403).",
        HTTP_429: "المصدر طلب تخفيف الطلبات عند قراءة robots.txt (HTTP 429).",
        HTTP_500: "ورد خطأ خادم عند طلب robots.txt (HTTP 500).",
        HTTP_502: "تعذّر اتصال خادم المصدر عند قراءة robots.txt (HTTP 502).",
        HTTP_503: "ملف robots.txt غير متاح من خادم المصدر (HTTP 503).",
        HTTP_504: "انتهت مهلة خادم المصدر عند قراءة robots.txt (HTTP 504).",
        TIMEOUT:
          "انتهت مهلة الاتصال بملف robots.txt بعد محاولة الاتصال بالمصدر.",
        TLS_VERIFICATION_FAILED:
          "تعذّر التحقق من شهادة اتصال المصدر عند قراءة robots.txt.",
        DNS_FAILURE: "تعذّر حل اسم نطاق المصدر عند قراءة robots.txt.",
        NETWORK_FAILURE: "تعذّر الاتصال الشبكي بالمصدر عند قراءة robots.txt.",
      };
      if (code === "TLS_VERIFICATION_FAILED" && source?.robots?.detail === "CERT_HAS_EXPIRED")
        reason = "انتهت صلاحية شهادة اتصال الموقع الرسمي. يتعذّر جلب فتاوى هذا المصدر حتى يجدد المسؤولون عن موقعه الشهادة.";
      else reason =
        code === "REDIRECT_OUTSIDE_SOURCE"
          ? `المصدر يحوّل طلب robots.txt إلى نطاق غير مسجّل: ${source.robots.redirectHost || "غير معروف"}.`
          : messages[code] ||
            "تعذّر الوصول إلى تعليمات الفهرسة لدى المصدر، فتوقفت عملية الجمع.";
    } else if (issues.includes("SOURCE_CHALLENGE"))
      reason = "المصدر يطلب تحققًا إضافيًا قبل قراءة الصفحات.";
    else if (issues.includes("SOURCE_ACCESS_DENIED"))
      reason = "المصدر لم يسمح بقراءة الصفحات أثناء الفهرسة.";
    else if (issues.includes("PAGE_UNAVAILABLE"))
      reason = "تعذّرت قراءة صفحات المصدر أثناء بناء الفهرس.";
    else
      reason =
        "لم تُكتشف عناوين قابلة للفهرسة في الصفحات التي تم الوصول إليها.";
  }
  const pageCode = source?.pageFailures?.[0]?.code;
  if (reason && pageCode && (issues.includes("PAGE_UNAVAILABLE") || issues.includes("SOURCE_ACCESS_DENIED")))
    reason += ` رمز الاتصال: ${pageCode}.`;
  return {
    count,
    featured: key === "alfawzan" ? catalog.records.filter(row => row.provider === key && row.contentKind === "archived-audio").slice(0, 10).map(({id,title,scholar,sourceUrl}) => ({id,title,scholar,sourceUrl})) : [],
    updatedAt: source?.updatedAt || catalog.generatedAt,
    lastAttemptAt: source?.lastAttemptAt || catalog.generatedAt,
    retained: !!source?.retained,
    warning: catalog.records.some(row => row.provider === key && row.contentKind === "archived-audio")
      ? "يتضمن هذا الفهرس تسجيلات فتاوى مؤرشفة من الموقع الرسمي؛ تاريخ الأرشفة موضح داخل التسجيل، وقد يضم التسجيل عدة أسئلة."
      : source?.retained
      ? "لم يكتمل تحديث المصدر؛ نعرض آخر فهرس محفوظ."
      : null,
    coverage: "partial",
    available: !!source && count > 0,
    pageCount: source?.pageCount ?? 0,
    pageFailures: source?.pageFailures ?? [],
    robots: source?.robots ?? null,
    reason,
  };
}
export function queryCatalog(catalog, key, query) {
  if (!providers[key])
    throw new SourceError("المصدر غير صالح.", "INVALID_PROVIDER");
  if (!catalogStatus(catalog, key).available)
    throw new SourceError(
      "لم نتمكن من بناء فهرس هذا المصدر من صفحاته الرسمية بعد. البحث غير متاح لهذا الشيخ حاليًا.",
      "CATALOG_EMPTY",
    );
  const topic = searchTopic(query);
  if (!topic)
    throw new SourceError(
      "اكتب موضوع الفتوى، مثل صلاة الوتر أو زكاة المال.",
      "QUERY_TOO_BROAD",
    );
  const count = topicTerms(topic).length;
  return catalog.records
    .filter((r) => r.provider === key)
    .map((r) => {
      const hits = relevance(`${r.title} ${r.contentKind === "archived-audio" ? r.question || "" : ""}`, topic);
      const score =
        hits +
        (hits === count ? 2 : 0) +
        (normalizeSearch(r.title).includes(normalizeSearch(topic)) ? 2 : 0);
      return { r, score, hits };
    })
    .filter((x) => x.hits > 0)
    .sort(
      (a, b) => b.score - a.score || a.r.title.localeCompare(b.r.title, "ar"),
    )
    .slice(0, 30)
    .map((x) => x.r);
}
export async function searchCatalog(provider, query) {
  const key = Object.keys(providers).find(
    (k) => providers[k].name === provider.name,
  );
  return queryCatalog(await loadCatalog(), key, query);
}

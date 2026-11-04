import {
  providers,
  searchSource,
  readSource,
  SourceError,
} from "../../server/fatwaSources.mjs";
export async function handler(event) {
  const headers = {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "Access-Control-Allow-Origin": "*",
  };
  const respond = (statusCode, data) => ({
    statusCode,
    headers,
    body: JSON.stringify(data),
  });
  if (event.httpMethod !== "GET")
    return respond(405, { error: "الطلب غير مدعوم." });
  const {
    scholar,
    action = "search",
    q = "",
    path = "",
  } = event.queryStringParameters || {};
  const provider = Object.hasOwn(providers, scholar || "")
    ? providers[scholar]
    : null;
  if (!provider) return respond(400, { error: "اختر أحد المشايخ المتاحين." });
  if (action !== "search" && action !== "read")
    return respond(400, { error: "الطلب غير صالح." });
  if (action === "search" && (q.trim().length < 2 || q.length > 120))
    return respond(400, { error: "اكتب موضوعًا بين حرفين و١٢٠ حرفًا." });
  try {
    return action === "read"
      ? respond(200, { fatwa: await readSource(provider, path) })
      : respond(200, {
          results: await searchSource(provider, q.trim()),
          source: provider.name,
        });
  } catch (e) {
    return respond(502, {
      code: e instanceof SourceError ? e.code : "SOURCE_UNAVAILABLE",
      release: process.env.COMMIT_REF?.slice(0, 7) || "local",
      ...(e instanceof SourceError && e.diagnostics
        ? { diagnostics: e.diagnostics }
        : {}),
      error:
        e instanceof SourceError
          ? e.message
          : "تعذّر تحميل محتوى المصدر. حاول مجددًا.",
    });
  }
}

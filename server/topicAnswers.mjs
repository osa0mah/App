import { loadCatalog, queryCatalog } from "./fatwaCatalog.mjs";
import { providers, readSource } from "./fatwaSources.mjs";
import { normalizeSearch, searchTopic, topicTerms, relevance } from "./searchText.mjs";
import tafsir from "../data/tafsir/saadi.json" with { type: "json" };
import {chapters} from "./quranContent.mjs";
export const scholarLabels = { binbaz: "ابن باز", ibnothaimeen: "ابن عثيمين", alfawzan: "صالح الفوزان" };
export function scholarsIn(text) {
  const normal = normalizeSearch(text);
  return Object.keys(scholarLabels).filter(key => key === "binbaz" ? /(?:ابن|بن) باز/.test(normal) : key === "ibnothaimeen" ? /عثيمي?ين/.test(normal) : /فوزان/.test(normal));
}
export function resolveTopic(message, history) {
  const current = searchTopic(message);
  const prior = history.filter(m => m.role === "user").map(m => m.content).reverse().find(text => {
    const n = normalizeSearch(text);
    return topicTerms(searchTopic(text)).length && !/^(?:السلام عليكم|مرحبا|اهلا|شكرا|جزاك)/.test(n) && !/تفسير|(?:^|\s)فسر(?:\s|$)|(?:^|\s)(?:سوره|الايه|ايه)(?:\s|$)/.test(n) && !/تسميع|الميكروفون/.test(n);
  });
  if (!current) return prior && (scholarsIn(message).length || /^(?:طيب|عند|وعند|والشيخ|نفس)(?:\s|$)|الدليل|ادلتها|توضيح|وضح|المزيد/.test(normalizeSearch(message))) ? searchTopic(prior) : "";
  const normal = normalizeSearch(message);
  if (prior && /وقتها|وقته|عددها|ركعاتها|ركعاته|كيفيتها|صفتها/.test(normal)) {
    const qualifier = current.replace(/وقتها|وقته/g,"وقت").replace(/عددها/g,"عدد").replace(/ركعاتها|ركعاته/g,"ركعات").replace(/كيفيتها|صفتها/g,"كيفية");
    return `${searchTopic(prior)} ${qualifier}`.trim();
  }
  return current;
}
function excerpt(text, limit = 1800) {
  if (text.length <= limit) return { text, truncated: false };
  const prefix = text.slice(0, limit);
  const boundary = Math.max(prefix.lastIndexOf("."), prefix.lastIndexOf("\n"));
  const end = boundary > limit * 0.6 ? boundary + 1 : prefix.lastIndexOf(" ");
  return { text: text.slice(0, end > 0 ? end : limit).trim(), truncated: true };
}
function relatedScripture(topic) {
  const count = topicTerms(topic).length;
  if (!count) return [];
  return tafsir.ayahs.map(entry => {
    const chapter = chapters.find(c => c.id === entry.surah);
    if (!chapter) return null;
    const verse = chapter.verses[entry.ayah - 1];
    // Require all substantive topic terms; generic worship words alone cannot
    // turn an unrelated verse into evidence for a specific ruling.
    if (!verse || relevance(`${verse} ${entry.text}`, topic) < count) return null;
    return { entry, chapter, verse };
  }).filter(Boolean).slice(0, 1).map(({entry,chapter,verse}) => {
    const quote = excerpt(entry.text);
    return { kind: "tafsir", title: `سورة ${chapter.name}، الآية ${entry.ayah} · تفسير السعدي`, url: tafsir.upstreamSource,
      text: `نص مرتبط بالموضوع من القرآن وتفسير السعدي — سورة ${chapter.name}، الآية ${entry.ayah}:\n﴿${verse}﴾\n\n${quote.text}${quote.truncated ? "\n(مقتطف من التفسير)" : ""}`,
      evidence: `سورة ${chapter.name}، الآية ${entry.ayah}: ${verse}\nتفسير السعدي: ${quote.text}`,
      suggestion: { section: "تعلّم", chapter: chapter.id, verse: entry.ayah }, actionLabel: `فتح تفسير ${chapter.name}: ${entry.ayah}` };
  });
}
export async function answerTopic(topic, keys, options = {}) {
  const catalog = options.search ? null : loadCatalog();
  const search = options.search || (async (provider, query) => queryCatalog(await catalog, Object.keys(providers).find(key => providers[key] === provider), query));
  const needed = Math.max(1, Math.ceil(topicTerms(topic).length * 0.65));
  const results = await Promise.all(keys.map(async key => {
    const target = { section: "الفتاوى", scholar: key, query: topic };
    try {
      const rows = await search(providers[key], topic);
      if (!rows.length) return { key, status: "empty" };
      const relevant = rows.map(row => ({ row, hits: relevance(`${row.title} ${row.snippet || ""} ${row.question || ""}`, topic) }))
        .filter(item => item.hits >= needed).sort((a,b) => b.hits-a.hits || a.row.title.length-b.row.title.length).slice(0,2);
      if (!relevant.length) return { key, status: "unrelated" };
      const deadline = AbortSignal.timeout(15000);
      for (const {row} of relevant) {
        if (deadline.aborted) break;
        try {
          const fetcher = (url, init = {}) => fetch(url, { ...init, signal: init.signal ? AbortSignal.any([init.signal,deadline]) : deadline });
          const article = options.read ? await options.read(providers[key], row.id) : await readSource(providers[key], row.id, fetcher);
          if (relevance(`${article.title} ${article.question || ""}`, topic) < needed) continue;
          const audioOnly = !!article.audioUrl && !article.answer;
          if (!audioOnly && (typeof article.answer !== "string" || !article.answer.trim())) continue;
          const quote = audioOnly ? null : excerpt(article.answer);
          return { key, status: "found", source: {
            kind: "fatwa", title: `${article.title} · ${providers[key].name}`, scholar: providers[key].name,
            url: article.archiveUrl || article.sourceUrl, suggestion: target, actionLabel: `فتح فتاوى ${scholarLabels[key]}`,
            text: audioOnly
              ? `وجدت تسجيلًا صوتيًا${article.archiveUrl ? " مؤرشفًا" : ""} في فتاوى ${scholarLabels[key]} بعنوان «${article.title}». لا يتوفر تفريغ نصي موثق له؛ يمكنك الاستماع داخل قسم الفتاوى.`
              : `وجدت هذا النص في فتاوى ${scholarLabels[key]} بعنوان «${article.title}»:\n\n${quote.text}${quote.truncated ? "\n(مقتطف من النص؛ يمكنك فتح المصدر الكامل في القسم)" : ""}`,
            ...(quote ? { evidence: `${providers[key].name} — ${article.title}:\n${quote.text}` } : {}),
          } };
        } catch { /* Another candidate or another scholar may still be available. */ }
      }
      return { key, status: "unavailable" };
    } catch { return { key, status: "unavailable" }; }
  }));
  const sources = [...results.filter(item => item.source).map(item => item.source), ...relatedScripture(topic)];
  const failed = results.filter(item => item.status === "unavailable");
  const missing = results.filter(item => item.status === "empty");
  let text;
  if (sources.length) {
    text = sources.map(source => source.text).join("\n\n────────\n\n");
    if (failed.length) text += `\n\nتعذّر جلب نص من ${failed.map(item => scholarLabels[item.key]).join("، ")} الآن؛ عرضت المصادر التي أمكن التحقق منها.`;
    if (missing.length) text += `\n\nلم أجد نتيجة مرتبطة في الفهرس المتاح لـ${missing.map(item => scholarLabels[item.key]).join("، ")}.`;
  } else if (results.some(item => item.status === "unrelated")) {
    text = "وجدت عناوين، لكن لم أتحقق من ارتباطها المباشر بسؤالك. حدّد المسألة أكثر حتى لا أعرض جوابًا عن موضوع مختلف.";
  } else if (failed.length) {
    text = "لم أتمكن من جلب نص موثق من المصادر المتاحة الآن. يمكنك إعادة المحاولة أو تحديد المسألة أكثر.";
  } else {
    text = "لم أجد نصًا مطابقًا في الفهارس المتاحة، وتغطيتها جزئية. جرّب صياغة المسألة بكلمات أقصر؛ لن أنسب إجابة إلى شيخ دون مصدر.";
  }
  const first = sources.find(source => source.kind === "fatwa") || sources[0];
  const evidence = sources.filter(source => source.evidence).map(source => source.evidence).join("\n\n");
  return { text, mode: "source", sources: sources.map(({text: _text, evidence: _evidence, ...citation}) => citation),
    source: first ? { title: first.title, url: first.url } : undefined,
    suggestion: first?.suggestion || { section: "الفتاوى", scholar: keys[0], query: topic },
    ...(evidence ? { evidence } : {}),
  };
}

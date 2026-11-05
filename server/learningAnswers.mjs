import catalog from "../data/learning/mokhtasar.json" with { type: "json" };
import { normalizeSearch } from "./searchText.mjs";
const chapters = catalog.chapters;
const pages = new Map(catalog.pages.map(page => [page.page, page]));
const digits = text => text.replace(/[٠-٩۰-۹]/g, digit => String("٠١٢٣٤٥٦٧٨٩".includes(digit) ? "٠١٢٣٤٥٦٧٨٩".indexOf(digit) : "۰۱۲۳۴۵۶۷۸۹".indexOf(digit)));
const aliases = chapters.map(chapter => ({ ...chapter, normal: normalizeSearch(chapter.name) })).sort((a,b)=>b.normal.length-a.normal.length);
const alternateNames = { "براءه":9, "بني اسراييل":17, "بني اسرائيل":17, "المومن":40, "قاف":50, "صاد":38, "ياسين":36 };
function selection(text) {
  const value = normalizeSearch(digits(text)).replace(/^(?:(?:طيب|تمام|اقصد|اريد|ابغي|ابي|هي|سوره|السوره|عن)\s+)*/, "").replace(/^و(?=ال)/, "");
  if (/^\d+$/.test(value)) return chapters.find(chapter => chapter.id === Number(value)) || null;
  return aliases.find(chapter => value === chapter.normal || value === chapter.normal.replace(/^ال/, "")) || chapters.find(chapter=>chapter.id===alternateNames[value]) || null;
}
function namedChapter(text) {
  const normal = normalizeSearch(digits(text));
  const number = normal.match(/(?:^|\s)(?:سوره|السوره)\s+(\d+)(?:\s|$)/);
  if (number) return chapters.find(chapter=>chapter.id===Number(number[1])) || null;
  return aliases.find(chapter => new RegExp(`(?:^|\\s)(?:و)?${chapter.normal}(?:\\s|$)`).test(normal)) || null;
}
function wantsLearning(text) {
  const normal = normalizeSearch(text);
  if (/مقاصد الشريعه/.test(normal)) return false;
  return /(?:^|\s)(?:مقاصد|المقاصد|مقصد|اهداف|الاهداف|هدايات|الهدايات|العبر|فوائد|الفوائد)(?:\s|$)|العلم والعمل|علم وعمل|دروس مستفاده|الدروس المستفاده|ماذا نتعلم|وش نتعلم|ايش نتعلم|نتعلم منها|نستفيد منها|نطبقها|التطبيق العملي|قسم التعلم/.test(normal);
}
function learningReply(text) {
  return /^(?:اي سوره تقصد.*مقاصد|مقاصد سوره)/.test(normalizeSearch(text));
}
const quickChoices = [1,2,18,112].map(id => chapters.find(chapter=>chapter.id===id)).map(chapter=>({label:chapter.name,message:`مقاصد العلم والعمل في سورة ${chapter.name}`}));
export function answerLearning(message, history, { legalIntent = false, chapterContext = null } = {}) {
  if (legalIntent) return null;
  const normal = normalizeSearch(digits(message));
  const lastUser = history.filter(item => item.role === "user").at(-1)?.content || "";
  const lastAssistant = history.filter(item => item.role === "assistant").at(-1)?.content || "";
  const previous = wantsLearning(lastUser) || learningReply(lastAssistant);
  const selected = selection(message);
  const explicitSelection = /(?:^|\s)(?:سوره|السوره)(?:\s|$)/.test(normal);
  const ack = /^(?:طيب|تمام|نعم|اوكي)$/.test(normal);
  const referential = /مقاصدها|اهدافها|هداياتها|فوائدها|نتعلم منها|نستفيد منها|نطبقها|باقي الفوائد|بقيه الفوائد/.test(normal);
  const recentChapter = [...history].reverse().filter(item=>item.role==="user").map(item=>selection(item.content)||namedChapter(item.content)).find(Boolean) || chapterContext;
  if (!wantsLearning(message) && !(referential && recentChapter) && !(previous && (selected || explicitSelection || ack || referential))) return null;
  const chapter = selected || namedChapter(message) || (referential && recentChapter ? chapters.find(item=>item.id===recentChapter.id) : null);
  if (!chapter) {
    return { mode: "source", text: "أي سورة تقصد؟ اكتب اسمها أو رقمها من ١ إلى ١١٤ لأعرض مقاصدها وما نتعلّمه منها ونعمل به.",
      suggestion: { section: "تعلّم" }, choices: quickChoices,
    };
  }
  const requestedPage = Number(normal.match(/من صفحه\s+(\d+)/)?.[1]);
  const offset = requestedPage ? chapter.pageNumbers.indexOf(requestedPage) : 0;
  if (offset < 0) return {mode:"source",text:`هذه الصفحة ليست ضمن صفحات سورة ${chapter.name} في المصدر. يمكنك فتح قسم التعلّم لعرض جميع فوائد السورة.`,suggestion:{section:"تعلّم",chapter:chapter.id}};
  const visible = chapter.pageNumbers.slice(offset, offset+3).map(number=>pages.get(number));
  const pageText = visible.map(page=>{
    const shared=page.chapters.length>1 ? `\nصفحة مشتركة: ${page.chapters.map(id=>chapters.find(chapter=>chapter.id===id).name).join("، ")}. الفوائد للصفحة مجتمعة، وليست كلها خاصة بسورة ${chapter.name}.` : "";
    return `فوائد صفحة المصدر ${page.page}:${shared}\n${page.benefits.map(benefit=>benefit.text).join("\n")}`;
  }).join("\n\n");
  const next = chapter.pageNumbers[offset+3];
  return { mode: "source", text: `مقاصد سورة ${chapter.name}:\n${chapter.purposes.join("\n")}\n\nمن العلم والعمل · فوائد الآيات:\n${pageText}\n\nهذه نصوص المقاصد والفوائد الواردة في المختصر، وليست حصرًا لكل استنباطات المفسرين.${next ? " تظهر الفوائد على دفعات؛ يمكنك متابعة البقية هنا أو فتح قسم التعلّم لعرضها كاملة." : ""}`,
    source: { title: `${catalog.source.title} · ${catalog.source.publisher} · ${catalog.source.host} · الإصدار ${catalog.source.version}`, url: chapter.sourceUrl },
    suggestion: { section: "تعلّم", chapter: chapter.id },
    ...(next ? {choices:[{label:"عرض بقية فوائد السورة",message:`فوائد سورة ${chapter.name} من صفحة ${next}`}]} : {}),
  };
}

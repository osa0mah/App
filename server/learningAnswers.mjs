import chapters from "../data/chapters.json" with { type: "json" };
import tafsir from "../data/tafsir/saadi.json" with { type: "json" };
import { normalizeSearch } from "./searchText.mjs";
// Names identify the user's selection; learning notes are returned only from
// the actual chapter records, never generated from this name list.
const names = "الفاتحة|البقرة|آل عمران|النساء|المائدة|الأنعام|الأعراف|الأنفال|التوبة|يونس|هود|يوسف|الرعد|إبراهيم|الحجر|النحل|الإسراء|الكهف|مريم|طه|الأنبياء|الحج|المؤمنون|النور|الفرقان|الشعراء|النمل|القصص|العنكبوت|الروم|لقمان|السجدة|الأحزاب|سبأ|فاطر|يس|الصافات|ص|الزمر|غافر|فصلت|الشورى|الزخرف|الدخان|الجاثية|الأحقاف|محمد|الفتح|الحجرات|ق|الذاريات|الطور|النجم|القمر|الرحمن|الواقعة|الحديد|المجادلة|الحشر|الممتحنة|الصف|الجمعة|المنافقون|التغابن|الطلاق|التحريم|الملك|القلم|الحاقة|المعارج|نوح|الجن|المزمل|المدثر|القيامة|الإنسان|المرسلات|النبأ|النازعات|عبس|التكوير|الانفطار|المطففين|الانشقاق|البروج|الطارق|الأعلى|الغاشية|الفجر|البلد|الشمس|الليل|الضحى|الشرح|التين|العلق|القدر|البينة|الزلزلة|العاديات|القارعة|التكاثر|العصر|الهمزة|الفيل|قريش|الماعون|الكوثر|الكافرون|النصر|المسد|الإخلاص|الفلق|الناس".split("|");
const aliases = names.map((name, index) => ({ name, id: index + 1, normal: normalizeSearch(name) }));
function selection(text) {
  const value = normalizeSearch(text).replace(/^(?:(?:طيب|تمام|اقصد|اريد|ابغي|ابي|هي|سوره|السوره|عن)\s+)*/, "").replace(/^و(?=ال)/, "");
  return aliases.find(chapter => value === chapter.normal || value === chapter.normal.replace(/^ال/, "")) || null;
}
function namedChapter(text) {
  const normal = normalizeSearch(text);
  return aliases.find(chapter => new RegExp(`(?:^|\\s)(?:و)?${chapter.normal}(?:\\s|$)`).test(normal)) || null;
}
function wantsLearning(text) {
  const normal = normalizeSearch(text);
  if (/مقاصد الشريعه/.test(normal)) return false;
  return /(?:^|\s)(?:مقاصد|المقاصد|مقصد|اهداف|الاهداف|هدايات|الهدايات|العبر|الفوائد)(?:\s|$)|العلم والعمل|علم وعمل|دروس مستفاده|الدروس المستفاده|ماذا نتعلم|وش نتعلم|ايش نتعلم|نتعلم منها|نستفيد منها|نطبقها|التطبيق العملي|قسم التعلم/.test(normal);
}
function learningReply(text) {
  return /^(?:اي سوره تقصد.*مقاصد|مقاصد سوره)/.test(normalizeSearch(text));
}
export function answerLearning(message, history, { legalIntent = false, chapterContext = null } = {}) {
  if (legalIntent) return null;
  const normal = normalizeSearch(message);
  const lastUser = history.filter(item => item.role === "user").at(-1)?.content || "";
  const lastAssistant = history.filter(item => item.role === "assistant").at(-1)?.content || "";
  const previous = wantsLearning(lastUser) || learningReply(lastAssistant);
  const selected = selection(message);
  const explicitSelection = /(?:^|\s)(?:سوره|السوره)(?:\s|$)/.test(normal);
  const ack = /^(?:طيب|تمام|نعم|اوكي)$/.test(normal);
  const referential = /مقاصدها|اهدافها|هداياتها|نتعلم منها|نستفيد منها|نطبقها/.test(normal);
  if (!wantsLearning(message) && !(referential && chapterContext) && !(previous && (selected || explicitSelection || ack || referential))) return null;
  const chapter = selected || namedChapter(message) || (referential && chapterContext ? aliases.find(item => item.id === chapterContext.id) : null);
  if (!chapter) {
    return { mode: "source", text: "أي سورة تقصد؟ اكتب اسمها لأعرض مقاصدها وما نتعلّمه منها ونعمل به.",
      suggestion: { section: "تعلّم" },
      choices: chapters.map(item => ({ label: item.name, message: `مقاصد العلم والعمل في سورة ${item.name}` })),
    };
  }
  const content = chapters.find(item => item.id === chapter.id);
  if (!content) {
    return { mode: "source", text: `مقاصد سورة ${chapter.name} والعلم والعمل فيها لم تُضف إلى المحتوى التعليمي بعد. المتاح حاليًا: ${chapters.map(item => item.name).join("، ")}. يمكنك اختيار سورة متاحة.`,
      suggestion: { section: "تعلّم" },
      choices: chapters.map(item => ({ label: item.name, message: `مقاصد العلم والعمل في سورة ${item.name}` })),
    };
  }
  return { mode: "source", text: `مقاصد سورة ${content.name}:\n${content.theme}\n\nمن العلم والعمل:\n${content.lessons.map(item => `• ${item}`).join("\n")}`,
    source: { title: "تلخيص تعليمي أولي مستند إلى تفسير السعدي", url: tafsir.upstreamSource },
    suggestion: { section: "تعلّم", chapter: content.id },
  };
}

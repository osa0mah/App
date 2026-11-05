export const normalizeSearch = (text) =>
  text
    .normalize("NFKC")
    .replace(/[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06ED\u0640]/g, "")
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/[^\u0621-\u064A0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
const stop = new Set(
  normalizeSearch(
    "طيب نعم والشيخ ما ماذا هو هي هل من عن في على الى الي لي انا اريد ابغى ابغي ابي اعرف عند فضلا ممكن فتوى الفتوى فتاوى الفتاوى الشيخ شيخ ابن بن باز الفوزان عثيمين العثيمين يقول قال حكم احكام سؤال سؤالي عندي استفسار استفسر باستفسر استفسارك ممكنك اود اريدك اعطني تعطيني اسال اسالك ابحث ابحثلي ابحثوا ابيك احتاج احتاجه كيف وكيف متى ومتى وهل وما ايش وش ماهي ماهو نبغى نبغي عني هذا هذه ذلك بخصوص موضوع بقول يقولون وماذا قارن اقارن مقارنة مقارنه بين اقوال اراء راي فقط كل الجميع المزيد اكثر وضح وضحلي توضيح توضح طيب افهم تعني يعني تفسير فسر اشرح معني معناها ادله ادلتها دليل القران والتفسير والقران والمشايخ المشايخ كلهم المصادر مصدر السلام عليكم ورحمة وبركاته",
  ).split(" "),
);
const stem = (w) => w.replace(/^(?:وال|فال|بال|كال|لل|ال)/, "");
const isStop = (w) => stop.has(w) || stop.has(stem(w));
export function topicTerms(text) {
  return [
    ...new Set(
      normalizeSearch(text)
        .split(" ")
        .filter((w) => w.length > 1 && !isStop(w))
        .map(stem),
    ),
  ].slice(0, 8);
}
export function searchTopic(text) {
  const words = text
    .normalize("NFKC")
    .replace(/[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06ED\u0640]/g, "")
    .replace(/(?:محمد بن صالح (?:ال)?عثيمي?ين|عبد ?العزيز بن باز|صالح الفوزان|ابن (?:ال)?عثيمي?ين|ابن باز)/g, " ")
    .replace(/[^\u0621-\u064A0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 1 && !isStop(normalizeSearch(w)));
  return [...new Set(words)].slice(0, 8).join(" ");
}
export function relevance(text, query) {
  const tokens = normalizeSearch(text).split(" ").map(stem);
  return topicTerms(query).reduce(
    (n, t) => n + (tokens.includes(t) ? 1 : 0),
    0,
  );
}

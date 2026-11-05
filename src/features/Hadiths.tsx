import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { contentBase } from "./contentApi";
import { f } from "./featureStyles";
import type { HadithDetail, HadithFilter, HadithSearch } from "./hadithTypes";
const arabic = (number: number) => number.toLocaleString("ar-SA");
const filters: { id: HadithFilter; label: string }[] = [
  { id: "all", label: "المكتبة كلها" }, { id: "albani", label: "صحّحه الألباني" },
  { id: "muttafaq", label: "متفق عليه" }, { id: "sahihayn", label: "روايات الصحيحين" },
];
export default function Hadiths({ initialQuery = "", initialId, onContentStart }: { initialQuery?: string; initialId?: string; onContentStart: () => void }) {
  const [query, setQuery] = useState(initialQuery);
  const [filter, setFilter] = useState<HadithFilter>("all");
  const [book, setBook] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<HadithSearch | null>(null);
  const [pending, setPending] = useState(true);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const [selected, setSelected] = useState<string | null>(initialId || null);
  const [detail, setDetail] = useState<HadithDetail | null>(null);
  const [detailPending, setDetailPending] = useState(!!initialId);
  const [detailError, setDetailError] = useState("");
  const [showSources, setShowSources] = useState(false);
  const [showGrades, setShowGrades] = useState(false);
  useEffect(() => {
    const controller = new AbortController(); let active = true;
    const timer = setTimeout(async () => {
      const timeout = setTimeout(() => controller.abort(), 25000);
      try {
        const params = new URLSearchParams({ q: query, filter, book, page: String(page) });
        const response = await fetch(`${contentBase}/api/hadiths?${params}`, { signal: controller.signal });
        if (!(response.headers.get("content-type") || "").includes("application/json")) throw Error("خدمة الأحاديث غير جاهزة. أعد تشغيل مشغّل المعاينة ثم حاول مجددًا.");
        const result = await response.json();
        if (!response.ok) throw Error(result.error || "تعذّر البحث في الأحاديث.");
        if (active) setData(result);
      } catch (e) { if (active) setError(controller.signal.aborted ? "تأخر تجهيز المكتبة. حاول مرة أخرى." : e instanceof Error ? e.message : "تعذّر تحميل المكتبة."); }
      finally { clearTimeout(timeout); if (active) setPending(false); }
    }, 250);
    return () => { active = false; clearTimeout(timer); controller.abort(); };
  }, [query, filter, book, page, retry]);
  useEffect(() => {
    if (!selected) return;
    const controller = new AbortController(); let active = true;
    const timeout = setTimeout(() => controller.abort(), 25000);
    (async () => {
      try {
        const response = await fetch(`${contentBase}/api/hadiths?${new URLSearchParams({ action: "read", id: selected })}`, { signal: controller.signal });
        const result = await response.json();
        if (!response.ok) throw Error(result.error || "تعذّرت قراءة الحديث.");
        if (active) setDetail(result.hadith);
      } catch (e) { if (active) setDetailError(controller.signal.aborted ? "تأخرت قراءة الحديث. حاول مرة أخرى." : e instanceof Error ? e.message : "تعذّرت قراءة الحديث."); }
      finally { clearTimeout(timeout); if (active) setDetailPending(false); }
    })();
    return () => { active = false; clearTimeout(timeout); controller.abort(); };
  }, [selected, retry]);
  const resetSearch = () => { setPending(true); setError(""); };
  const retryRequest = () => { resetSearch(); setDetailPending(!!selected); setDetailError(""); setRetry(value => value+1); };
  const open = (id: string) => { setDetail(null); setDetailPending(true); setDetailError(""); setShowGrades(false); setSelected(id); onContentStart(); };
  const changePage = (next: number) => { resetSearch(); setPage(next); onContentStart(); };
  if (selected) return <>
    <Pressable accessibilityRole="button" style={f.chip} onPress={() => { setSelected(null); onContentStart(); }}><Text style={f.label}>→ العودة إلى نتائج الأحاديث</Text></Pressable>
    {detailPending && <Text accessibilityLiveRegion="polite" style={f.note}>جارٍ فتح الحديث…</Text>}
    {!!detailError && <Text style={f.error}>{detailError}</Text>}
    {!!detailError && <Pressable accessibilityRole="button" style={f.button} onPress={retryRequest}><Text style={f.buttonText}>إعادة المحاولة</Text></Pressable>}
    {detail && <>
      <Text accessibilityRole="header" style={[f.title, { marginTop: 24 }]}>{detail.title}</Text>
      <View style={f.card}>
        <View style={f.row}><Text style={s.badge}>{detail.grade}</Text>{detail.muttafaq && <Text style={s.badge}>متفق عليه</Text>}</View>
        <Text selectable style={s.hadithText}>{detail.text}</Text>
        <Text style={f.source}>{detail.collectionTitle} · {detail.numberLabel}: {detail.number}</Text>
      </View>
      <View style={f.card}>
        <Text accessibilityRole="header" style={f.title}>التخريج والحكم</Text>
        <Text selectable style={f.text}>{detail.attribution}</Text>
        <Text style={f.text}>{detail.gradedBy}: {detail.grade}</Text>
        {detail.qualification === "albani" && <Text style={f.note}>الحكم منسوب إلى الألباني كما نُقل في مجموعة Hadith API، وليس حكمًا جديدًا من التطبيق.</Text>}
        {detail.qualification === "sahihayn" && <Text style={f.note}>عرض الرواية من الكتاب المذكور لا يعني وصفها بأنها «متفق عليه»؛ هذا الوصف يظهر فقط عند التصريح به في مصدر التخريج.</Text>}
        {!!detail.otherGrades.length && <>
          <Pressable accessibilityRole="button" style={f.chip} accessibilityState={{ expanded: showGrades }} onPress={() => setShowGrades(value => !value)}><Text style={f.label}>{showGrades ? "إخفاء" : "عرض"} الأحكام الأخرى الواردة في المصدر</Text></Pressable>
          {showGrades && <View style={{ marginTop: 12 }}><Text style={f.note}>قد تختلف أحكام المحدّثين. هذه النقول كما سجلتها مجموعة البيانات، ولا تدل على إجماع.</Text>{detail.otherGrades.map((grade, index) => <Text key={index} style={f.text}>{grade.name}: {grade.grade}</Text>)}</View>}
        </>}
      </View>
      {!!detail.explanation && <View style={f.card}><Text accessibilityRole="header" style={f.title}>شرح الحديث</Text><Text selectable style={f.text}>{detail.explanation}</Text></View>}
      {!!detail.benefits && <View style={f.card}><Text accessibilityRole="header" style={f.title}>فوائد الحديث</Text><Text selectable style={f.text}>{detail.benefits}</Text></View>}
      {!!detail.wordMeanings && detail.wordMeanings !== "...." && <View style={f.card}><Text accessibilityRole="header" style={f.title}>معاني الكلمات</Text><Text selectable style={f.text}>{detail.wordMeanings}</Text></View>}
      <View style={f.card}><Text style={f.title}>توثيق المصدر</Text><Text selectable style={f.source}>{detail.sourceName}{"\n"}{detail.sourceUrl}{"\n"}الإصدار: {detail.sourceVersion}{"\n\n"}{detail.sourceNotice}</Text></View>
    </>}
  </>;
  return <>
    <View style={s.hero}>
      <Text style={s.heroLabel}>هدي النبي ﷺ</Text>
      <Text accessibilityRole="header" style={s.heroTitle}>الأحاديث</Text>
      <Text style={s.heroNote}>اقرأ الحديث مع مصدره وحكمه، وابحث في روايات الصحيحين وما صحّحه الألباني.</Text>
      {data && <View style={s.stats}>{[{ label: "سجل ورواية", value: data.stats.total }, { label: "وفق أحكام الألباني", value: data.stats.albani }, { label: "متفق عليه", value: data.stats.muttafaq }].map(stat => <View key={stat.label} style={s.stat}><Text style={s.statValue}>{arabic(stat.value)}</Text><Text style={s.statLabel}>{stat.label}</Text></View>)}</View>}
    </View>
    <TextInput nativeID="hadith-search" accessibilityLabel="البحث في الأحاديث" style={f.input} placeholder="ابحث بكلمات من الحديث أو برقمه" value={query} maxLength={200} onChangeText={value => { resetSearch(); setQuery(value); setPage(1); }} />
    <View style={f.row}>{filters.map(item => <Pressable accessibilityRole="button" accessibilityState={{ selected: filter === item.id }} key={item.id} style={[f.chip, filter === item.id && f.selected]} onPress={() => { if (filter === item.id && !book && page === 1) return; resetSearch(); setFilter(item.id); setBook(""); setPage(1); }}><Text style={f.label}>{item.label}</Text></Pressable>)}</View>
    {!!data?.collections.length && <View style={f.row}>
      <Pressable accessibilityRole="button" style={[f.chip, !book && f.selected]} onPress={() => { if (!book && page === 1) return; resetSearch(); setBook(""); setPage(1); }}><Text style={f.label}>جميع المصادر</Text></Pressable>
      {data.collections.filter(collection => filter === "albani" ? ["abudawud", "tirmidhi", "nasai", "ibnmajah"].includes(collection.id) : filter === "sahihayn" ? ["bukhari", "muslim"].includes(collection.id) : filter === "muttafaq" ? collection.id === "hadeethenc" : true).map(collection => <Pressable accessibilityRole="button" accessibilityState={{ selected: book === collection.id }} key={collection.id} style={[f.chip, book === collection.id && f.selected]} onPress={() => { if (book === collection.id && page === 1) return; resetSearch(); setBook(collection.id); setPage(1); }}><Text style={f.label}>{collection.title}</Text></Pressable>)}
    </View>}
    <Text style={f.note}>«متفق عليه» يعني رواه البخاري ومسلم، ولا يعني إجماع العلماء على جميع أحكام المكتبة. الأعداد سجلات وروايات، وفيها تكرار بين المصادر.</Text>
    {pending && <Text accessibilityLiveRegion="polite" style={f.note}>جارٍ البحث في المكتبة المحلية…</Text>}
    {!!error && <><Text style={f.error}>{error}</Text><Pressable accessibilityRole="button" style={f.button} onPress={retryRequest}><Text style={f.buttonText}>إعادة المحاولة</Text></Pressable></>}
    {!pending && !error && data && <>
      <Text accessibilityLiveRegion="polite" style={f.note}>{arabic(data.total)} نتيجة · صفحة {arabic(page)} من {arabic(Math.max(1, data.pages))}</Text>
      {data.items.map(item => <Pressable accessibilityRole="button" accessibilityLabel={`فتح ${item.title}`} key={item.id} style={f.card} onPress={() => open(item.id)}>
        <Text style={f.title}>{item.title}</Text>
        <View style={f.row}><Text style={s.badge}>{item.grade}</Text>{item.muttafaq && <Text style={s.badge}>متفق عليه</Text>}</View>
        <Text style={f.text}>{item.excerpt}</Text>
        <Text style={f.source}>{item.collectionTitle} · {item.numberLabel}: {item.number} · {item.gradedBy}</Text>
        <Text style={[f.label, { marginTop: 14 }]}>{item.hasExplanation ? "قراءة الحديث وشرحه" : "قراءة النص والتخريج"} ←</Text>
      </Pressable>)}
      {!data.items.length && <View style={f.card}><Text style={f.text}>لم نجد نتيجة مطابقة لهذه الكلمات والفلاتر. جرّب كلمات أقل أو غيّر المصدر.</Text><Text style={f.note}>غياب الحديث من المكتبة لا يعني أنه ضعيف أو غير موجود في المصادر الأخرى.</Text></View>}
      <View style={f.row}>
        {page > 1 && <Pressable accessibilityRole="button" style={f.chip} onPress={() => changePage(page-1)}><Text style={f.label}>الصفحة السابقة</Text></Pressable>}
        {page < data.pages && <Pressable accessibilityRole="button" style={f.button} onPress={() => changePage(page+1)}><Text style={f.buttonText}>الصفحة التالية</Text></Pressable>}
      </View>
    </>}
    <Pressable accessibilityRole="button" accessibilityState={{ expanded: showSources }} style={f.chip} onPress={() => setShowSources(value => !value)}><Text style={f.label}>{showSources ? "إخفاء" : "عرض"} المصادر وحدود التغطية</Text></Pressable>
    {showSources && <View style={[f.card, { marginTop: 14 }]}>
      <Text style={f.title}>عن المكتبة</Text>
      <Text style={f.note}>تشمل الروايات غير الفارغة في صحيح البخاري وصحيح مسلم بحسب المجموعة الرقمية، والمقبول من أحكام الألباني الصريحة في سنن أبي داود وجامع الترمذي وسنن النسائي وسنن ابن ماجه، وسجلات ذات حكم صريح بالصحة من موسوعة الأحاديث النبوية. تشمل أحكام الألباني «صحيح» و«حسن صحيح» وبعض صيغ التصحيح الصريحة، مع إبقاء الحكم الفعلي ظاهرًا. لا تشمل كل كتب الألباني أو جميع الأحاديث الصحيحة في التراث، ولا يُستنتج تصحيح المتن من صحة الإسناد وحدها.</Text>
      {data?.sources.map(source => <Text key={source.id} selectable style={f.source}>{source.title}{"\n"}{source.url}{"\n"}الإصدار: {source.version}{"\n"}{source.notice}</Text>)}
    </View>}
  </>;
}
const s = StyleSheet.create({
  hero: { backgroundColor: "#193D35", borderRadius: 22, padding: 22, marginBottom: 20 },
  heroLabel: { color: "#DBC69B", textAlign: "right", fontSize: 13 },
  heroTitle: { color: "#FFF", textAlign: "right", fontSize: 30, marginVertical: 12 },
  heroNote: { color: "#E6ECE5", textAlign: "right", fontSize: 15, lineHeight: 27 },
  stats: { flexDirection: "row-reverse", flexWrap: "wrap", gap: 8, marginTop: 18 },
  stat: { backgroundColor: "#285044", borderRadius: 12, padding: 12, minWidth: 82, flex: 1 },
  statValue: { color: "#FFF", textAlign: "center", fontSize: 20 },
  statLabel: { color: "#C6D6CB", textAlign: "center", fontSize: 11, marginTop: 8 },
  badge: { backgroundColor: "#EAF0E8", color: "#17624D", fontSize: 13, padding: 8, borderRadius: 9, textAlign: "right" },
  hadithText: { color: "#193D35", fontSize: 20, lineHeight: 38, textAlign: "right" },
});

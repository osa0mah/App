import React, { useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { learningChapters, learningChapterNames, learningPages, learningSource, normalizeChapterSearch } from "../learning";
import { muyassarSource, muyassarVerse, revelationNotes, surahIntroduction } from "../tafsir";
import { surahs } from "../content";
import type { ChatSuggestion } from "./ChatAssistant";
import { f } from "./featureStyles";
const arabic = (number: number) => number.toLocaleString("ar-SA");
const sections = ["نظرة عامة", "المقاصد", "العلم والعمل", "التفسير", "النزول"] as const;
type Section = typeof sections[number];
function Card({ title, number, children }: { title: string; number: string; children: React.ReactNode }) {
  return <View style={f.card}>
    <View style={s.sectionHeading}><Text style={s.sectionNumber}>{number}</Text><Text accessibilityRole="header" style={s.cardTitle}>{title}</Text></View>
    {children}
  </View>;
}
export default function Learning({ initialChapter, onNavigate, onContentStart }: { initialChapter?: number | null; onNavigate: (target: ChatSuggestion) => void; onContentStart: () => void }) {
  const [selected, setSelected] = useState<number | null>(initialChapter ?? null);
  const [query, setQuery] = useState("");
  const [section, setSection] = useState<Section>("نظرة عامة");
  const [benefitQuery, setBenefitQuery] = useState("");
  const [visiblePages, setVisiblePages] = useState(6);
  const [verseInput, setVerseInput] = useState("1");
  const chapter = learningChapters.find(item => item.id === selected);
  const changeSection = (value: Section) => { setSection(value); onContentStart(); };
  const choose = (id: number) => { setSelected(id); changeSection("نظرة عامة"); setBenefitQuery(""); setVisiblePages(6); setVerseInput("1"); };
  if (!chapter) {
    const normal = normalizeChapterSearch(query);
    const list = learningChapters.filter(item => normalizeChapterSearch(item.name).includes(normal) || String(item.id) === normal);
    return <>
      <Text accessibilityRole="header" style={f.title}>تعلّم السورة</Text>
      <Text style={f.note}>تعرّف على كل سورة: اسمها، ونزولها، ومقاصدها، وهداياتها وتفسير آياتها.</Text>
      <TextInput nativeID="learning-surah-search" accessibilityLabel="البحث في سور التعلّم" style={f.input}
        placeholder="ابحث باسم السورة أو رقمها" value={query} onChangeText={setQuery} />
      {list.map(item => <Pressable key={item.id} accessibilityRole="button" accessibilityLabel={`تعلّم سورة ${item.name}`}
        style={[f.card, s.surahRow]} onPress={() => choose(item.id)}>
        <View style={s.surahNumber}><Text style={f.label}>{arabic(item.id)}</Text></View>
        <View style={{ flex: 1 }}><Text style={s.cardTitle}>سورة {item.name}</Text><Text style={f.note}>{arabic(item.verseCount)} آيات · {item.place}</Text></View>
        <Text style={s.arrow}>‹</Text>
      </Pressable>)}
      {!list.length && <Text style={f.note}>لم نجد سورة بهذا الاسم أو الرقم. جرّب اسمًا آخر أو رقمًا من ١ إلى ١١٤.</Text>}
    </>;
  }
  const overview = section === "نظرة عامة";
  const introduction = surahIntroduction(chapter.id);
  const scripture = surahs.find(item => item.id === chapter.id)!;
  const allPages = learningPages(chapter);
  const normal = normalizeChapterSearch(benefitQuery);
  const pages = allPages.map(page => ({ ...page, benefits: page.benefits.filter(benefit => normalizeChapterSearch(benefit.text).includes(normal)) })).filter(page => page.benefits.length);
  const shared = allPages.some(page => page.chapters.length > 1);
  const notes = revelationNotes(chapter.id);
  const verse = Number(normalizeChapterSearch(verseInput));
  const validVerse = Number.isInteger(verse) && verse >= 1 && verse <= chapter.verseCount;
  const detail = (label: string, target: Section) => <Pressable accessibilityRole="button" style={[f.chip, { marginTop: 14, alignSelf: "flex-end" }]} onPress={() => changeSection(target)}><Text style={f.label}>{label} ←</Text></Pressable>;
  return <>
    <Pressable accessibilityRole="button" style={[f.chip, { alignSelf: "flex-end" }]} onPress={() => { setSelected(null); onContentStart(); }}><Text style={f.label}>→ العودة إلى السور</Text></Pressable>
    <View style={s.hero}>
      <Text style={s.eyebrow}>تعلّم · تدبّر · اعمل</Text>
      <Text accessibilityRole="header" style={s.heroTitle}>سورة {chapter.name}</Text>
      <Text style={s.heroSummary}>{chapter.purposes[0]}</Text>
      <View style={s.facts}>
        {[{ label: "ترتيب المصحف", value: arabic(chapter.id) }, { label: "عدد الآيات", value: arabic(chapter.verseCount) }, { label: "تصنيف النزول", value: chapter.place }].map(fact => <View key={fact.label} style={s.fact}><Text style={s.factValue}>{fact.value}</Text><Text style={s.factLabel}>{fact.label}</Text></View>)}
      </View>
    </View>
    <View style={f.row}>
      {sections.map(item => <Pressable accessibilityRole="tab" accessibilityState={{ selected: section === item }} key={item} style={[f.chip, section === item && f.selected]} onPress={() => changeSection(item)}><Text style={f.label}>{item}</Text></Pressable>)}
    </View>
    {overview && <Card title="التعريف بالسورة وسبب تسميتها" number="١">
      <Text selectable style={f.text}>{introduction.naming}</Text>
      <Text style={f.source}>من مقدمة السورة في التفسير الميسر، إصدار {muyassarSource.version}.</Text>
    </Card>}
    {(overview || section === "المقاصد") && <Card title="مقاصد السورة" number="٢">
      <Text style={s.subheading}>المقصد العام</Text>
      {chapter.purposes.map(purpose => <Text selectable key={purpose} style={f.text}>{purpose}</Text>)}
      <Text style={f.source}>المختصر في تفسير القرآن الكريم · QuranEnc.com</Text>
      <Text style={s.subheading}>المقاصد بالتفصيل</Text>
      {(overview ? introduction.purposes.slice(0, 3) : introduction.purposes).map(purpose => <Text selectable key={purpose} style={[f.text, s.paragraph]}>{purpose}</Text>)}
      <Text style={f.source}>من مقدمة السورة في التفسير الميسر.</Text>
      {overview && introduction.purposes.length > 3 && detail(`عرض المقاصد كاملة (${arabic(introduction.purposes.length)})`, "المقاصد")}
    </Card>}
    {(overview || section === "العلم والعمل") && <Card title="هدايات العلم والعمل" number="٣">
      <Text style={f.note}>فوائد مستخرجة في المختصر لفهم المعنى والاتعاظ والعمل به.</Text>
      {shared && <Text style={s.sharedNote}>{learningSource.sharedPageNotice}</Text>}
      {overview ? <>
        {allPages[0].chapters.length > 1 && <Text style={f.note}>الفوائد التالية من صفحة مشتركة: {learningChapterNames(allPages[0].chapters)}.</Text>}
        {allPages[0].benefits.slice(0, 3).map(benefit => <Text selectable key={benefit.id} style={[f.text, s.paragraph]}>{benefit.text}</Text>)}
        {detail("استعراض جميع الهدايات والبحث فيها", "العلم والعمل")}
      </> : <>
        <TextInput nativeID="learning-benefit-search" accessibilityLabel="البحث في فوائد السورة" style={f.input} placeholder="ابحث داخل فوائد السورة" value={benefitQuery} onChangeText={value => { setBenefitQuery(value); setVisiblePages(6); }} />
        {pages.slice(0, visiblePages).map(page => <View key={page.page} style={s.benefitGroup}>
          <Text style={s.subheading}>فوائد صفحة المصدر {arabic(page.page)}</Text>
          {page.chapters.length > 1 && <Text style={f.note}>صفحة مشتركة: {learningChapterNames(page.chapters)}. الفوائد التالية للصفحة مجتمعة.</Text>}
          {page.benefits.map(benefit => <Text selectable key={benefit.id} style={[f.text, s.paragraph]}>{benefit.text}</Text>)}
          <Text selectable style={f.source}>{page.sourceUrl}</Text>
        </View>)}
        {!pages.length && <Text style={f.note}>لا توجد فوائد مطابقة لعبارة البحث داخل هذه السورة.</Text>}
        {pages.length > visiblePages && <Pressable accessibilityRole="button" style={f.button} onPress={() => setVisiblePages(previous => previous+6)}><Text style={f.buttonText}>عرض المزيد من فوائد السورة ({arabic(pages.length-visiblePages)} صفحات متبقية)</Text></Pressable>}
      </>}
    </Card>}
    {(overview || section === "التفسير") && <Card title="تفسير آيات السورة" number="٤">
      <Text style={s.subheading}>التفسير الميسر</Text>
      {overview ? <>
        <Text style={f.note}>تفسير جميع آيات السورة داخل التطبيق، مع اختيار رقم الآية والتنقّل بينها.</Text>
        {detail("فتح تفسير آيات السورة", "التفسير")}
      </> : <>
        <TextInput nativeID="learning-verse-number" accessibilityLabel="رقم الآية في التفسير" keyboardType="number-pad" style={f.input} placeholder={`رقم الآية من ١ إلى ${arabic(chapter.verseCount)}`} value={verseInput} onChangeText={setVerseInput} />
        {validVerse ? <>
          <Text selectable style={f.verse}>{scripture.verses[verse-1]} ﴿{arabic(verse)}﴾</Text>
          <Text selectable style={f.text}>{muyassarVerse(chapter.id, verse)}</Text>
          <View style={[f.row, { marginTop: 16 }]}>
            <Pressable accessibilityRole="button" disabled={verse === 1} accessibilityState={{ disabled: verse === 1 }} style={f.chip} onPress={() => setVerseInput(String(verse-1))}><Text style={f.label}>الآية السابقة</Text></Pressable>
            <Pressable accessibilityRole="button" disabled={verse === chapter.verseCount} accessibilityState={{ disabled: verse === chapter.verseCount }} style={f.chip} onPress={() => setVerseInput(String(verse+1))}><Text style={f.label}>الآية التالية</Text></Pressable>
          </View>
        </> : <Text style={f.error}>أدخل رقم آية من ١ إلى {arabic(chapter.verseCount)}.</Text>}
      </>}
      <Text style={f.source}>النص: التفسير الميسر · مجموعة Tafsir API · الإصدار {muyassarSource.version}.</Text>
    </Card>}
    {(overview || section === "النزول") && <Card title="النزول وسياق الآيات" number="٥">
      <Text style={s.subheading}>مرحلة النزول: {chapter.place}</Text>
      <Text style={f.text}>تصنيف السورة بحسب بيانات Tanzil.info. وقد يوجد خلاف في تصنيف بعض السور أو في بعض آياتها؛ ولا يحدد هذا التصنيف تاريخًا دقيقًا لنزول السورة.</Text>
      <Text style={s.subheading}>أسباب النزول</Text>
      {notes.length ? <>
        <Text style={f.note}>وردت إشارات إلى سياق نزول بعض الآيات في التفسير الميسر. تُعرض بنصها مع رقم الآية، وليست سببًا واحدًا لنزول السورة كلها.</Text>
        {overview ? detail(`قراءة إشارات النزول (${arabic(notes.length)})`, "النزول") : notes.map(note => <View style={s.benefitGroup} key={note.verse}><Text style={s.subheading}>الآية {arabic(note.verse)}</Text><Text selectable style={f.text}>{note.text}</Text></View>)}
      </> : <Text style={f.text}>لا يتوفر في المحتوى المضمن نص صريح عن سبب نزول لهذه السورة. لا يلزم أن تكون لكل سورة رواية خاصة لسبب نزولها.</Text>}
    </Card>}
    <View style={f.row}>
      <Pressable accessibilityRole="button" style={f.button} onPress={() => onNavigate({ section: "القرآن", chapter: chapter.id })}><Text style={f.buttonText}>قراءة سورة {chapter.name}</Text></Pressable>
      <Pressable accessibilityRole="button" style={f.chip} onPress={() => onNavigate({ section: "التسميع", chapter: chapter.id })}><Text style={f.label}>تسميع السورة</Text></Pressable>
    </View>
    <View style={s.sources}>
      <Text style={s.subheading}>المصادر</Text>
      <Text selectable style={f.source}>{learningSource.title}، {learningSource.publisher}، عبر {learningSource.host} · الإصدار {learningSource.version}{"\n"}{chapter.sourceUrl}{"\n\n"}التفسير الميسر · Tafsir API · {muyassarSource.version}{"\n"}{muyassarSource.upstreamSource}</Text>
    </View>
  </>;
}
const s = StyleSheet.create({
  hero: { backgroundColor: "#193D35", borderRadius: 24, padding: 24, marginVertical: 20 },
  eyebrow: { color: "#DBC69B", textAlign: "right", fontSize: 13 },
  heroTitle: { color: "#FFF", fontSize: 32, textAlign: "right", marginVertical: 12 },
  heroSummary: { color: "#E6ECE5", fontSize: 16, lineHeight: 29, textAlign: "right" },
  facts: { flexDirection: "row-reverse", flexWrap: "wrap", gap: 10, marginTop: 22 },
  fact: { flex: 1, minWidth: 78, padding: 12, backgroundColor: "#285044", borderRadius: 12 },
  factValue: { color: "#FFF", textAlign: "center", fontSize: 19, fontWeight: "600" },
  factLabel: { color: "#C6D6CB", textAlign: "center", fontSize: 11, marginTop: 8 },
  sectionHeading: { flexDirection: "row-reverse", alignItems: "center", gap: 12, marginBottom: 16 },
  sectionNumber: { color: "#BA9655", fontSize: 20 },
  cardTitle: { flexShrink: 1, fontSize: 20, color: "#193D35", fontWeight: "600", textAlign: "right" },
  subheading: { color: "#17624D", fontWeight: "600", fontSize: 15, textAlign: "right", marginTop: 16, marginBottom: 10 },
  paragraph: { marginBottom: 14 },
  sharedNote: { color: "#73603D", backgroundColor: "#F8F3E8", padding: 12, borderRadius: 10, fontSize: 13, lineHeight: 24, textAlign: "right", marginBottom: 16 },
  benefitGroup: { borderTopColor: "#E5EADF", borderTopWidth: 1, paddingVertical: 12, marginTop: 12 },
  sources: { padding: 16, marginBottom: 16 },
  surahRow: { flexDirection: "row-reverse", alignItems: "center", gap: 16 },
  surahNumber: { backgroundColor: "#EAF0E8", padding: 12, borderRadius: 14, minWidth: 48, alignItems: "center" },
  arrow: { color: "#BA9655", fontSize: 28 },
});

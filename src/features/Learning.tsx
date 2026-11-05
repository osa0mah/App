import React, { useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import { learningChapters, learningChapterNames, learningPages, learningSource, normalizeChapterSearch } from "../learning";
import { f } from "./featureStyles";
const arabic = (number: number) => number.toLocaleString("ar-SA");
export default function Learning({ initialChapter }: { initialChapter?: number | null }) {
  const [selected, setSelected] = useState<number | null>(initialChapter ?? null);
  const [query, setQuery] = useState("");
  const [benefitQuery, setBenefitQuery] = useState("");
  const [visiblePages, setVisiblePages] = useState(6);
  const chapter = learningChapters.find(item => item.id === selected);
  if (!chapter) {
    const normal = normalizeChapterSearch(query);
    const list = learningChapters.filter(item => normalizeChapterSearch(item.name).includes(normal) || String(item.id) === normal);
    return <>
      <Text accessibilityRole="header" style={f.title}>تعلّم السورة</Text>
      <Text style={f.note}>مقاصد السور الـ١١٤ وفوائد الآيات للعلم والعمل، من المختصر في تفسير القرآن الكريم.</Text>
      <TextInput nativeID="learning-surah-search" accessibilityLabel="البحث في سور التعلّم" style={f.input}
        placeholder="ابحث باسم السورة أو رقمها" value={query} onChangeText={setQuery} />
      {list.map(item => <Pressable key={item.id} accessibilityRole="button" accessibilityLabel={`تعلّم سورة ${item.name}`}
        style={f.card} onPress={() => { setSelected(item.id); setBenefitQuery(""); setVisiblePages(6); }}>
        <Text style={f.title}>{arabic(item.id)} · سورة {item.name}</Text>
        <Text style={f.note}>{arabic(item.verseCount)} آيات · {item.place} · المقاصد وفوائد الآيات</Text>
      </Pressable>)}
      {!list.length && <Text style={f.note}>لم نجد سورة بهذا الاسم أو الرقم. جرّب اسمًا آخر أو رقمًا من ١ إلى ١١٤.</Text>}
    </>;
  }
  const normal = normalizeChapterSearch(benefitQuery);
  const pages = learningPages(chapter).map(page => ({ ...page, benefits: page.benefits.filter(benefit => normalizeChapterSearch(benefit.text).includes(normal)) })).filter(page => page.benefits.length);
  return <>
    <Pressable accessibilityRole="button" style={f.chip} onPress={() => setSelected(null)}><Text style={f.label}>→ العودة إلى السور</Text></Pressable>
    <Text accessibilityRole="header" style={[f.title, { marginTop: 20 }]}>سورة {chapter.name}</Text>
    <Text style={f.note}>{arabic(chapter.verseCount)} آيات · {chapter.place}</Text>
    <View style={f.card}>
      <Text accessibilityRole="header" style={f.title}>مقاصد السورة</Text>
      {chapter.purposes.map(purpose => <Text selectable key={purpose} style={f.text}>{purpose}</Text>)}
      <Text style={f.source}>نص «من مقاصد السورة» كما ورد في {learningSource.title}، {learningSource.publisher}، عبر {learningSource.host} · الإصدار {learningSource.version}.</Text>
    </View>
    <Text accessibilityRole="header" style={f.title}>العلم والعمل · فوائد الآيات</Text>
    <Text style={f.note}>جميع الفوائد الواردة في صفحات هذه السورة بالمصدر. {learningSource.sharedPageNotice}</Text>
    <TextInput nativeID="learning-benefit-search" accessibilityLabel="البحث في فوائد السورة" style={f.input}
      placeholder="ابحث داخل فوائد السورة" value={benefitQuery} onChangeText={value => { setBenefitQuery(value); setVisiblePages(6); }} />
    {pages.slice(0, visiblePages).map(page => <View key={page.page} style={f.card}>
      <Text accessibilityRole="header" style={f.title}>فوائد صفحة المصدر {arabic(page.page)}</Text>
      {page.chapters.length > 1 && <Text style={f.note}>صفحة مشتركة: {learningChapterNames(page.chapters)}. الفوائد التالية للصفحة مجتمعة.</Text>}
      {page.benefits.map(benefit => <Text selectable key={benefit.id} style={[f.text, { marginBottom: 12 }]}>{benefit.text}</Text>)}
      <Text selectable style={f.source}>المصدر: {learningSource.title} · {learningSource.host}{"\n"}{page.sourceUrl}</Text>
    </View>)}
    {!pages.length && <Text style={f.note}>لا توجد فوائد مطابقة لعبارة البحث داخل هذه السورة.</Text>}
    {pages.length > visiblePages && <Pressable accessibilityRole="button" style={f.button} onPress={() => setVisiblePages(previous => previous+6)}>
      <Text style={f.buttonText}>عرض المزيد من فوائد السورة ({arabic(pages.length-visiblePages)} صفحات متبقية)</Text>
    </Pressable>}
    <View style={f.card}>
      <Text style={f.title}>عن المحتوى ومصدره</Text>
      <Text selectable style={f.note}>{learningSource.title}، {learningSource.publisher}، عبر {learningSource.host} · الإصدار {learningSource.version}{"\n"}{chapter.sourceUrl}{"\n"}{learningSource.scope}</Text>
      <Text style={f.note}>وصف مكية أو مدنية بحسب بيانات Tanzil.info، وقد يوجد خلاف في تصنيف بعض السور. لا يعني ذلك تحديد تاريخ نزول السورة أو سبب نزولها.</Text>
    </View>
  </>;
}

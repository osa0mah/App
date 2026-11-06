import { useState, type Dispatch, type SetStateAction } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { tajweedLessons, tajweedGroups, tajweedReferences, tajweedRiwaya, tajweedEditorialNote, tajweedTeachers, lessonClips, tajweedExample, type TajweedTeacher } from "../tajweed";
import { normalizeChapterSearch } from "../learning";
import TajweedMedia from "./TajweedMedia";
import { f } from "./featureStyles";
const arabic = (number: number) => number.toLocaleString("ar-SA");
export default function Tajweed({ initialLesson, onContentStart, completed, onCompletedChange: setCompleted }: { initialLesson?: string; onContentStart: () => void; completed: Set<string>; onCompletedChange: Dispatch<SetStateAction<Set<string>>> }) {
  const [selected, setSelected] = useState<string | null>(initialLesson || null);
  const [query, setQuery] = useState("");
  const [group, setGroup] = useState("all");
  const [teacher, setTeacher] = useState<TajweedTeacher>("ayman");
  const [clipId, setClipId] = useState<string | null>(null);
  const [playerOpen, setPlayerOpen] = useState(false);
  const [answer, setAnswer] = useState<number | null>(null);
  const lesson = tajweedLessons.find(item => item.id === selected);
  const openLesson = (id: string) => { setSelected(id); setTeacher("ayman"); setClipId(null); setPlayerOpen(false); setAnswer(null); onContentStart(); };
  if (!lesson) {
    const normal = normalizeChapterSearch(query);
    const list = tajweedLessons.filter(item => (group === "all" || item.group === group) && normalizeChapterSearch(`${item.title} ${item.summary}`).includes(normal));
    return <>
      <View style={s.hero}>
        <Text style={s.eyebrow}>تعلّم النطق الصحيح</Text><Text accessibilityRole="header" style={s.heroTitle}>التجويد</Text>
        <Text style={s.heroText}>دروس مكتوبة، وأمثلة من القرآن، وشروح لأيمن سويد وفارس عنتر بحسب المتوفر لكل درس.</Text>
        <View style={s.facts}>{[{ number: tajweedLessons.length, label: "درسًا" }, { number: tajweedGroups.length, label: "أبواب" }, { number: completed.size, label: "درسته في الجلسة" }].map(item => <View style={s.fact} key={item.label}><Text style={s.factNumber}>{arabic(item.number)}</Text><Text style={s.factLabel}>{item.label}</Text></View>)}</View>
      </View>
      <Text style={f.note}>{tajweedRiwaya}</Text>
      <TextInput nativeID="tajweed-search" accessibilityLabel="البحث في دروس التجويد" style={f.input} placeholder="ابحث عن حكم مثل الإخفاء أو المد الطبيعي" value={query} onChangeText={setQuery} />
      <View style={f.row}>
        <Pressable accessibilityRole="button" accessibilityState={{ selected: group === "all" }} style={[f.chip, group === "all" && f.selected]} onPress={() => setGroup("all")}><Text style={f.label}>كل الدروس</Text></Pressable>
        {tajweedGroups.map(item => <Pressable accessibilityRole="button" accessibilityState={{ selected: group === item.id }} key={item.id} style={[f.chip, group === item.id && f.selected]} onPress={() => setGroup(item.id)}><Text style={f.label}>{item.title}</Text></Pressable>)}
      </View>
      <Text accessibilityLiveRegion="polite" style={f.note}>{arabic(list.length)} دروس متاحة</Text>
      {list.map(item => <Pressable accessibilityRole="button" accessibilityLabel={`فتح درس ${item.title}`} key={item.id} style={f.card} onPress={() => openLesson(item.id)}>
        <View style={s.lessonHeader}><Text style={s.lessonNumber}>{arabic(tajweedLessons.indexOf(item)+1)}</Text><Text style={f.title}>{item.title}</Text></View>
        <Text style={f.text}>{item.summary}</Text><Text style={f.note}>{tajweedGroups.find(category => category.id === item.group)!.title} · {item.level}{completed.has(item.id) ? " · تمت دراسته" : ""}</Text>
        <Text style={f.label}>شرح مكتوب · أمثلة · {item.media.fares.length ? "فيديو وصوت" : "فيديو"} · سؤال مراجعة ←</Text>
      </Pressable>)}
      {!list.length && <Text style={f.note}>لا يوجد درس يطابق عبارة البحث ضمن هذا الباب. جرّب كلمات أقل أو اختر «كل الدروس».</Text>}
      <Text style={f.note}>{tajweedEditorialNote}</Text>
    </>;
  }
  const clips = lessonClips(lesson, teacher);
  const clip = clips.find(item => item.id === clipId) || clips[0];
  const index = tajweedLessons.indexOf(lesson);
  return <>
    <Pressable accessibilityRole="button" style={f.chip} onPress={() => { setPlayerOpen(false); setSelected(null); onContentStart(); }}><Text style={f.label}>→ العودة إلى دروس التجويد</Text></Pressable>
    <Text accessibilityRole="header" style={[f.title, { marginTop: 24 }]}>{lesson.title}</Text>
    <Text style={f.note}>{tajweedRiwaya} · {lesson.level}</Text>
    <View style={f.card}><Text accessibilityRole="header" style={f.title}>تعريف الحكم</Text><Text selectable style={f.text}>{lesson.summary}</Text></View>
    <View style={f.card}><Text accessibilityRole="header" style={f.title}>كيف أطبّقه؟</Text>{lesson.steps.map((step, number) => <Text selectable key={step} style={[f.text, { marginBottom: 12 }]}>{arabic(number+1)}. {step}</Text>)}</View>
    <View style={f.card}>
      <Text accessibilityRole="header" style={f.title}>أمثلة من القرآن</Text>
      {lesson.examples.map((example, number) => { const parts = tajweedExample(example); return <View key={`${example.chapter}:${example.verse}:${number}`} style={s.example}>
        <Text style={f.note}>سورة {parts.name} · الآية {arabic(example.verse)} · {example.context}</Text>
        <Text selectable style={f.verse}>{parts.before}<Text style={s.focus}>{parts.focus}</Text>{parts.after} ﴿{arabic(example.verse)}﴾</Text>
        <Text selectable style={f.text}>{example.explanation}</Text>
      </View>; })}
      <Text style={f.source}>الآيات من Tanzil · الرسم العثماني 1.1 · https://tanzil.net</Text>
    </View>
    <View style={s.warning}><Text style={f.title}>انتبه لهذا الخطأ</Text><Text style={f.text}>{lesson.commonMistake}</Text></View>
    <View style={f.card}>
      <Text accessibilityRole="header" style={f.title}>الشرح بالمقاطع</Text>
      <View style={f.row}>{tajweedTeachers.map(item => { const id = item.id as TajweedTeacher; const available = lesson.media[id].length > 0; return <Pressable accessibilityRole="button" accessibilityState={{ selected: teacher === id, disabled: !available }} disabled={!available} key={id} style={[f.chip, teacher === id && f.selected, !available && s.unavailable]} onPress={() => { setTeacher(id); setClipId(null); setPlayerOpen(false); }}><Text style={f.label}>{item.name} · {id === "ayman" ? "فيديو" : "صوتي"}{!available ? " (لم يُربط بهذا الدرس بعد)" : ""}</Text></Pressable>; })}</View>
      {clips.length > 1 && <View style={f.row}>{clips.map((item, number) => <Pressable accessibilityRole="button" accessibilityState={{ selected: clip.id === item.id }} key={item.id} style={[f.chip, clip.id === item.id && f.selected]} onPress={() => { setClipId(item.id); setPlayerOpen(false); }}><Text style={f.label}>المقطع {arabic(number+1)}</Text></Pressable>)}</View>}
      {clip ? <>
        <Text style={f.text}>{clip.title}</Text>
        <Text style={f.note}>{clip.type === "video" ? "شرح بالفيديو" : "نسخة صوتية للشرح"}{clip.duration ? ` · نحو ${arabic(Math.ceil(clip.duration/60))} دقيقة` : ""} · يحتاج اتصالًا بالإنترنت</Text>
        {playerOpen ? <><TajweedMedia key={clip.id} clip={clip} /><Pressable accessibilityRole="button" style={[f.chip, { marginTop: 12 }]} onPress={() => setPlayerOpen(false)}><Text style={f.label}>إغلاق المقطع</Text></Pressable></> : <Pressable accessibilityRole="button" style={f.button} onPress={() => setPlayerOpen(true)}><Text style={f.buttonText}>{clip.type === "video" ? "فتح فيديو الشرح داخل التطبيق" : "فتح الشرح الصوتي داخل التطبيق"}</Text></Pressable>}
        <Text selectable style={f.source}>المصدر: Internet Archive · نسخة أرشيفية منشورة باسم المعلّم، وليست رابط قناة رسمية موثقة هنا.{"\n"}{clip.sourceUrl}</Text>
      </> : <Text style={f.note}>لم نربط مقطعًا موثق العنوان لهذا المعلّم بهذا الدرس حتى الآن. جرّب المعلّم الآخر.</Text>}
    </View>
    {lesson.question && <View style={f.card}>
      <Text accessibilityRole="header" style={f.title}>راجع فهمك للقاعدة</Text><Text style={f.text}>{lesson.question.prompt}</Text>
      <View style={{ marginTop: 12 }}>{lesson.question.choices.map((option, number) => <Pressable accessibilityRole="button" accessibilityState={{ selected: answer === number }} key={option} style={[f.chip, { marginBottom: 8 }, answer === number && f.selected]} onPress={() => setAnswer(number)}><Text style={f.label}>{option}</Text></Pressable>)}</View>
      {answer !== null && <Text accessibilityLiveRegion="polite" style={answer === lesson.question.answerIndex ? f.text : f.error}>{answer === lesson.question.answerIndex ? "إجابة صحيحة. " : "راجع القاعدة. "}{lesson.question.explanation}</Text>}
    </View>}
    <View style={f.row}>
      <Pressable accessibilityRole="button" style={f.button} onPress={() => setCompleted(previous => { const next = new Set(previous); if (next.has(lesson.id)) next.delete(lesson.id); else next.add(lesson.id); return next; })}><Text style={f.buttonText}>{completed.has(lesson.id) ? "إلغاء علامة تمت الدراسة" : "أنهيت دراسة هذا الدرس"}</Text></Pressable>
      {index > 0 && <Pressable accessibilityRole="button" style={f.chip} onPress={() => openLesson(tajweedLessons[index-1].id)}><Text style={f.label}>الدرس السابق</Text></Pressable>}
      {index < tajweedLessons.length-1 && <Pressable accessibilityRole="button" style={f.chip} onPress={() => openLesson(tajweedLessons[index+1].id)}><Text style={f.label}>الدرس التالي</Text></Pressable>}
    </View>
    <Text style={f.note}>علامة الدراسة للمتابعة في هذه الجلسة فقط، وليست تقييمًا لصحة النطق. {tajweedEditorialNote}</Text>
    {tajweedReferences.map(source => <Text selectable key={source.id} style={f.source}>مرجع الأبواب: {source.title}{"\n"}{source.url}</Text>)}
  </>;
}
const s = StyleSheet.create({
  hero: { backgroundColor: "#193D35", padding: 24, borderRadius: 22, marginBottom: 16 },
  eyebrow: { color: "#DBC69B", fontSize: 13, textAlign: "right" },
  heroTitle: { color: "#FFF", fontSize: 30, textAlign: "right", marginVertical: 14 },
  heroText: { color: "#E6ECE5", fontSize: 16, lineHeight: 28, textAlign: "right" },
  facts: { flexDirection: "row-reverse", gap: 10, flexWrap: "wrap", marginTop: 20 },
  fact: { flex: 1, minWidth: 78, backgroundColor: "#285044", padding: 12, borderRadius: 12 },
  factNumber: { color: "#FFF", fontSize: 21, textAlign: "center" },
  factLabel: { color: "#C6D6CB", fontSize: 11, textAlign: "center", marginTop: 8 },
  lessonHeader: { flexDirection: "row-reverse", gap: 14, alignItems: "center" },
  lessonNumber: { color: "#BA9655", fontSize: 20, marginBottom: 12 },
  example: { borderTopColor: "#E3E8DE", borderTopWidth: 1, paddingVertical: 12 },
  focus: { backgroundColor: "#DCE9D6", color: "#124B3A" },
  warning: { backgroundColor: "#F5EDDC", borderRadius: 16, padding: 20, marginBottom: 16 },
  unavailable: { opacity: 0.55 },
});

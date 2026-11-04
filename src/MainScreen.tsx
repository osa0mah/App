import React, { useState } from "react";
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { surahs, Surah } from "./content";
import Tafsir from "./features/Tafsir";
import VerseAudio from "./features/VerseAudio";
import Readers from "./features/Readers";
import ChatAssistant, {
  ChatMessage,
  ChatSuggestion,
} from "./features/ChatAssistant";
import Fatwas from "./features/Fatwas";
import Recitation from "./features/Recitation";
const tabs = ["الرئيسية", "القرآن", "تعلّم", "المساعد"] as const;
type Screen = (typeof tabs)[number] | "القراء" | "الفتاوى" | "التسميع";
const colors = {
  ink: "#193D35",
  muted: "#738077",
  green: "#17624D",
  paper: "#F7F6EF",
  gold: "#BA9655",
};
const arabic = (n: number) => n.toLocaleString("ar-SA");
function Button({
  label,
  onPress,
  secondary = false,
}: {
  label: string;
  onPress: () => void;
  secondary?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={[s.button, secondary && s.secondary]}
    >
      <Text style={[s.buttonText, secondary && { color: colors.green }]}>
        {label}
      </Text>
    </Pressable>
  );
}
export default function App() {
  const router = useRouter();
  const params = useLocalSearchParams<{ section?: string }>();
  const valid: Screen[] = [...tabs, "القراء", "الفتاوى", "التسميع"];
  const screen: Screen = valid.includes(params.section as Screen)
    ? (params.section as Screen)
    : "الرئيسية";
  const setScreen = (target: Screen) => router.setParams({ section: target });
  const [surah, setSurah] = useState<Surah | null>(null);
  const [tafsirTarget, setTafsirTarget] = useState<{
    chapter: number;
    verse: number;
  } | null>(null);
  const [verse, setVerse] = useState<number | null>(null);
  const [query, setQuery] = useState("");
  const [reader] = useState("الحصري");
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [fatwaContext, setFatwaContext] = useState<{
    scholar?: string;
    query?: string;
  }>({});
  const openChatSection = (target: ChatSuggestion) => {
    setTafsirTarget(
      target.chapter && target.verse
        ? { chapter: target.chapter, verse: target.verse }
        : null,
    );
    setScreen(target.section);
    setSurah(
      target.chapter
        ? (surahs.find((c) => c.id === target.chapter) ?? null)
        : null,
    );
    setQuery("");
    if (target.section === "الفتاوى")
      setFatwaContext({ scholar: target.scholar, query: target.query });
  };
  const [bookmark, setBookmark] = useState<{
    id: number;
    verse: number;
  } | null>(null);
  const navigate = (target: Screen) => {
    setScreen(target);
    setSurah(null);
    setQuery("");
  };
  const fullReader = screen === "القرآن" && surah !== null;
  const list = surahs.filter(
    (x) => x.name.includes(query.trim()) || String(x.id) === query.trim(),
  );
  const heading = (title: string, subtitle?: string) => (
    <View style={s.heading}>
      <Text accessibilityRole="header" style={s.title}>
        {title}
      </Text>
      {subtitle && <Text style={s.sub}>{subtitle}</Text>}
    </View>
  );
  const sourceButton = (id: number, v = 1) => (
    <Button
      secondary
      label="قراءة تفسير السعدي داخل التطبيق"
      onPress={() => setTafsirTarget({ chapter: id, verse: v })}
    />
  );
  const cards = () =>
    list.map((item) => (
      <Pressable
        accessibilityRole="button"
        key={item.id}
        style={s.surahRow}
        onPress={() => {
          setSurah(item);
        }}
      >
        <Text style={s.arrow}>‹</Text>
        <View style={{ flex: 1 }}>
          <Text style={s.cardTitle}>سورة {item.name}</Text>
          <Text style={s.sub}>
            {arabic(item.verses.length)} آيات · {item.place}
          </Text>
        </View>
        <View style={s.number}>
          <Text style={s.numberText}>{arabic(item.id)}</Text>
        </View>
      </Pressable>
    ));
  return (
    <SafeAreaView style={s.safe}>
      <StatusBar style="dark" />
      {!fullReader && (
        <View style={s.top}>
          <Text style={s.brand}>
            أثر القرآن <Text style={{ color: colors.gold }}>✦</Text>
          </Text>
          <Text style={s.tag}>اقرأ، تعلّم، واعمل</Text>
        </View>
      )}
      <ScrollView
        style={fullReader ? s.readerScroll : undefined}
        contentContainerStyle={fullReader ? s.readerBody : s.body}
        keyboardShouldPersistTaps="handled"
      >
        {screen === "الرئيسية" && (
          <>
            {heading("رحلتك مع القرآن", "مساحة للفهم والتدبّر والعمل")}
            <View style={s.hero}>
              <Text style={s.eyebrow}>كل يوم، أثرٌ يبقى</Text>
              <Text style={s.heroTitle}>
                قراءة تُنير قلبك،{"\n"}ومعانٍ ترافق يومك.
              </Text>
              <Text style={s.heroSub}>ابدأ بسورة، وتوقّف عند معانيها.</Text>
              <Button
                label="ابدأ القراءة  ←"
                onPress={() => navigate("القرآن")}
              />
            </View>
            <View style={s.section}>
              <Text style={s.sectionTitle}>اكتشف أبواب الخير</Text>
              <Text style={s.small}>نسخة أولية</Text>
            </View>
            <View style={s.grid}>
              {(
                [
                  { name: "القرآن", icon: "۞", desc: "اقرأ وتدبّر آيةً آية" },
                  { name: "تعلّم", icon: "✧", desc: "مقاصد السور وهداياتها" },
                  { name: "القراء", icon: "♫", desc: "اختر صوتًا يرافقك" },
                  {
                    name: "التسميع",
                    icon: "◎",
                    desc: "سمّع بصوتك وتابع الكلمات",
                  },
                  {
                    name: "الفتاوى",
                    icon: "▤",
                    desc: "ارجع إلى المصادر الرسمية",
                  },
                  {
                    name: "المساعد",
                    icon: "✦",
                    desc: "اسأل واقرأ الإجابة هنا",
                  },
                ] as const
              ).map((item) => (
                <Pressable
                  accessibilityRole="button"
                  key={item.name}
                  style={s.tile}
                  onPress={() => navigate(item.name)}
                >
                  <Text style={s.tileIcon}>{item.icon}</Text>
                  <Text style={s.cardTitle}>{item.name}</Text>
                  <Text style={s.tileDesc}>{item.desc}</Text>
                </Pressable>
              ))}
            </View>
            {bookmark && (
              <Button
                secondary
                label={`متابعة سورة ${surahs.find((x) => x.id === bookmark.id)?.name} · الآية ${arabic(bookmark.verse)}`}
                onPress={() => {
                  setScreen("القرآن");
                  setSurah(surahs.find((x) => x.id === bookmark.id)!);
                  setVerse(bookmark.verse);
                }}
              />
            )}
            <Text style={s.note}>
              المحتوى المتاح الآن: الفاتحة والإخلاص. بقية المصحف والخدمات قيد
              التطوير.
            </Text>
          </>
        )}
        {(screen === "القرآن" ||
          screen === "تعلّم" ||
          screen === "التسميع") && (
          <>
            {surah ? (
              <>
                {fullReader ? (
                  <View style={s.readerToolbar}>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="العودة إلى السور"
                      onPress={() => setSurah(null)}
                      style={s.readerBack}
                    >
                      <Text style={s.readerBackText}>السور →</Text>
                    </Pressable>
                    <Text style={s.readerCaption}>القرآن الكريم</Text>
                  </View>
                ) : (
                  <>
                    <Button
                      secondary
                      label="→ العودة إلى السور"
                      onPress={() => setSurah(null)}
                    />
                    {heading(
                      `سورة ${surah.name}`,
                      `${arabic(surah.verses.length)} آيات · ${surah.place}`,
                    )}
                  </>
                )}
                {screen === "تعلّم" ? (
                  <>
                    <View style={s.card}>
                      <Text style={s.sectionTitle}>مقاصد السورة</Text>
                      <Text style={s.prose}>{surah.theme}</Text>
                      <Text style={s.sectionTitle}>العلم والعمل</Text>
                      {surah.lessons.map((t) => (
                        <Text style={s.prose} key={t}>
                          • {t}
                        </Text>
                      ))}
                    </View>
                    <View style={s.card}>
                      <Text style={s.sectionTitle}>
                        متى نزلت؟ وما سبب نزولها؟
                      </Text>
                      <Text style={s.prose}>
                        لم ندرج هنا تاريخًا محددًا أو رواية لسبب النزول. إضافة
                        هذه المعلومات تحتاج توثيق الروايات ومراجعتها، وقد يخص
                        سبب النزول آيات دون السورة كاملة.
                      </Text>
                    </View>
                    <Text style={s.note}>
                      تلخيص تعليمي أولي لمعاني السورة، مستند إلى تفسير السعدي،
                      ويحتاج مراجعة علمية قبل النشر.
                    </Text>
                    {sourceButton(surah.id)}
                  </>
                ) : (
                  <>
                    {screen === "التسميع" && (
                      <Recitation key={surah.id} surah={surah} />
                    )}
                    {screen !== "التسميع" && (
                      <View style={fullReader ? s.mushafPage : s.page}>
                        {fullReader && (
                          <View style={s.surahFrame}>
                            <Text style={s.ornament}>✦</Text>
                            <Text
                              accessibilityRole="header"
                              style={s.surahHeading}
                            >
                              سورة {surah.name}
                            </Text>
                            <Text style={s.ornament}>✦</Text>
                          </View>
                        )}
                        {surah.id !== 1 && (
                          <Text style={s.basmala}>
                            بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ
                          </Text>
                        )}
                        {fullReader ? (
                          <Text style={s.mushafText}>
                            {surah.verses.map((text, i) => (
                              <Text
                                key={i}
                                accessibilityRole="button"
                                accessibilityLabel={`الآية ${i + 1}: ${text}`}
                                onPress={() => setVerse(i + 1)}
                              >
                                {text}{" "}
                                <Text style={s.verseNumber}>
                                  ﴿{arabic(i + 1)}﴾
                                </Text>{" "}
                              </Text>
                            ))}
                          </Text>
                        ) : (
                          surah.verses.map((text, i) => (
                            <Pressable
                              accessibilityRole="button"
                              accessibilityLabel={`الآية ${i + 1}: ${text}`}
                              key={i}
                              onPress={() => setVerse(i + 1)}
                              style={s.verse}
                            >
                              <Text style={s.quran}>
                                {text}{" "}
                                <Text style={s.verseNumber}>
                                  ﴿{arabic(i + 1)}﴾
                                </Text>
                              </Text>
                            </Pressable>
                          ))
                        )}
                      </View>
                    )}
                    {screen !== "التسميع" && (
                      <Text style={fullReader ? s.readerHint : s.note}>
                        اضغط على الآية لعرض خياراتها. النص التجريبي برواية حفص،
                        ويحتاج مقابلة على مصحف معتمد قبل النشر.
                      </Text>
                    )}
                  </>
                )}
              </>
            ) : (
              <>
                {heading(
                  screen === "تعلّم"
                    ? "تعلّم السورة"
                    : screen === "التسميع"
                      ? "راجع حفظك"
                      : "القرآن الكريم",
                  screen === "تعلّم"
                    ? "من المعرفة إلى العمل"
                    : "سورتان متاحتان في النسخة الأولى",
                )}
                <TextInput
                  nativeID="quran-surah-search"
                  accessibilityLabel="البحث عن سورة"
                  style={s.input}
                  placeholder="ابحث باسم السورة أو رقمها"
                  value={query}
                  onChangeText={setQuery}
                />
                {cards()}
                {list.length === 0 && (
                  <Text style={s.note}>
                    هذه السورة غير متاحة في النسخة الأولية.
                  </Text>
                )}
              </>
            )}
          </>
        )}
        {screen === "القراء" && <Readers />}
        {screen === "الفتاوى" && (
          <Fatwas
            initialScholar={fatwaContext.scholar}
            initialQuery={fatwaContext.query}
          />
        )}
        {screen === "المساعد" && (
          <ChatAssistant
            messages={chatMessages}
            onMessagesChange={setChatMessages}
            onNavigate={openChatSection}
          />
        )}
        {!fullReader && (
          <Text style={s.footer}>أثر القرآن · رحلة علم وعمل</Text>
        )}
      </ScrollView>
      {!fullReader && (
        <View style={s.nav}>
          {tabs.map((t, i) => (
            <Pressable
              accessibilityRole="tab"
              accessibilityState={{ selected: screen === t }}
              key={t}
              style={s.navItem}
              onPress={() => navigate(t)}
            >
              <Text style={[s.navIcon, screen === t && s.active]}>
                {["⌂", "۞", "✧", "✦"][i]}
              </Text>
              <Text style={[s.navLabel, screen === t && s.active]}>{t}</Text>
            </Pressable>
          ))}
        </View>
      )}
      <Modal
        visible={verse !== null || tafsirTarget !== null}
        transparent
        animationType="slide"
        onRequestClose={() => {
          if (tafsirTarget) setTafsirTarget(null);
          else setVerse(null);
        }}
      >
        {tafsirTarget ? (
          <Tafsir
            chapter={tafsirTarget.chapter}
            verse={tafsirTarget.verse}
            onClose={() => setTafsirTarget(null)}
          />
        ) : (
          <View style={s.overlay}>
            <View style={s.sheet}>
              <Text style={s.title}>
                {surah?.name} · الآية {arabic(verse ?? 1)}
              </Text>
              <Text style={[s.quran, { marginVertical: 18 }]}>
                {surah?.verses[(verse ?? 1) - 1]}
              </Text>
              {surah && sourceButton(surah.id, verse ?? 1)}
              {surah && verse && (
                <VerseAudio
                  key={`${surah.id}:${verse}`}
                  label={`استماع بصوت ${reader}`}
                  source={`https://everyayah.com/data/Husary_128kbps/${String(surah.id).padStart(3, "0")}${String(verse).padStart(3, "0")}.mp3`}
                />
              )}
              <Button
                secondary
                label="حفظ موضع القراءة لهذه الجلسة"
                onPress={() => {
                  if (surah && verse) setBookmark({ id: surah.id, verse });
                  setVerse(null);
                }}
              />
              <Button secondary label="إغلاق" onPress={() => setVerse(null)} />
            </View>
          </View>
        )}
      </Modal>
    </SafeAreaView>
  );
}
const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.paper },
  readerScroll: { flex: 1, backgroundColor: "#FFFDF6" },
  readerBody: {
    flexGrow: 1,
    padding: 14,
    width: "100%",
    maxWidth: 800,
    alignSelf: "center",
  },
  readerToolbar: {
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  readerBack: {
    minHeight: 44,
    paddingHorizontal: 12,
    justifyContent: "center",
  },
  readerBackText: { color: colors.green, fontSize: 15 },
  readerCaption: { color: colors.muted, fontSize: 13, paddingHorizontal: 12 },
  mushafPage: {
    flexGrow: 1,
    borderWidth: 1,
    borderColor: "#D9C89D",
    padding: 18,
    backgroundColor: "#FFFDF6",
  },
  surahFrame: {
    borderWidth: 1,
    borderColor: "#D9C89D",
    backgroundColor: "#F3EFDF",
    paddingVertical: 14,
    paddingHorizontal: 20,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 24,
  },
  surahHeading: { fontSize: 25, fontWeight: "600", color: colors.ink },
  ornament: { fontSize: 24, color: colors.gold },
  mushafText: {
    fontSize: 29,
    lineHeight: 59,
    textAlign: "center",
    writingDirection: "rtl",
    color: colors.ink,
  },
  readerHint: {
    fontSize: 11,
    lineHeight: 20,
    textAlign: "center",
    color: colors.muted,
    marginTop: 12,
  },
  top: {
    paddingHorizontal: 24,
    paddingVertical: 18,
    borderBottomWidth: 1,
    borderBottomColor: "#E5E8DF",
  },
  brand: {
    fontSize: 25,
    fontWeight: "800",
    color: colors.ink,
    textAlign: "right",
  },
  tag: { fontSize: 12, color: colors.muted, textAlign: "right", marginTop: 4 },
  body: {
    padding: 22,
    paddingBottom: 30,
    maxWidth: 760,
    width: "100%",
    alignSelf: "center",
  },
  heading: { marginBottom: 22, marginTop: 8 },
  title: {
    fontSize: 27,
    fontWeight: "700",
    color: colors.ink,
    textAlign: "right",
  },
  sub: {
    fontSize: 13,
    lineHeight: 24,
    color: colors.muted,
    textAlign: "right",
  },
  hero: {
    backgroundColor: colors.ink,
    borderRadius: 24,
    padding: 25,
    marginBottom: 27,
  },
  eyebrow: { color: "#DBC697", textAlign: "right", fontSize: 13 },
  heroTitle: {
    color: "#FFFCF1",
    fontSize: 29,
    lineHeight: 46,
    textAlign: "right",
    fontWeight: "700",
    marginVertical: 15,
  },
  heroSub: { color: "#D2DFD5", textAlign: "right", marginBottom: 19 },
  button: {
    backgroundColor: colors.green,
    padding: 15,
    borderRadius: 13,
    marginVertical: 6,
  },
  buttonText: {
    color: "#FFF",
    fontSize: 15,
    fontWeight: "600",
    textAlign: "center",
  },
  secondary: { backgroundColor: "#EAF0E8" },
  section: {
    flexDirection: "row-reverse",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 15,
  },
  sectionTitle: {
    fontSize: 19,
    color: colors.ink,
    fontWeight: "700",
    textAlign: "right",
    marginBottom: 7,
  },
  small: { color: colors.muted, fontSize: 12 },
  grid: { flexDirection: "row-reverse", flexWrap: "wrap", gap: 12 },
  tile: {
    width: "47.5%",
    flexGrow: 1,
    backgroundColor: "#FFF",
    borderColor: "#E4E8DF",
    borderWidth: 1,
    borderRadius: 18,
    padding: 18,
    minHeight: 143,
    alignItems: "flex-end",
  },
  tileIcon: { fontSize: 29, color: colors.gold, marginBottom: 12 },
  cardTitle: {
    fontSize: 18,
    color: colors.ink,
    fontWeight: "600",
    textAlign: "right",
  },
  tileDesc: {
    fontSize: 12,
    color: colors.muted,
    textAlign: "right",
    lineHeight: 21,
    marginTop: 6,
  },
  note: {
    fontSize: 13,
    lineHeight: 24,
    color: colors.muted,
    textAlign: "right",
    marginVertical: 18,
  },
  footer: {
    color: colors.muted,
    textAlign: "center",
    fontSize: 12,
    marginTop: 30,
  },
  nav: {
    flexDirection: "row-reverse",
    backgroundColor: "#FFF",
    borderTopWidth: 1,
    borderColor: "#E5E8DF",
    paddingVertical: 12,
  },
  navItem: { flex: 1, alignItems: "center", minHeight: 44 },
  navIcon: { fontSize: 24, color: "#929D94" },
  navLabel: { fontSize: 11, color: colors.muted, marginTop: 4 },
  active: { color: colors.green, fontWeight: "700" },
  input: {
    backgroundColor: "#FFF",
    borderWidth: 1,
    borderColor: "#DDE4D9",
    borderRadius: 14,
    padding: 17,
    textAlign: "right",
    fontSize: 16,
    color: colors.ink,
    marginBottom: 17,
  },
  surahRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 15,
    backgroundColor: "#FFF",
    borderRadius: 17,
    padding: 19,
    marginBottom: 12,
  },
  number: {
    width: 43,
    height: 43,
    borderRadius: 12,
    backgroundColor: "#EDF2E9",
    justifyContent: "center",
    alignItems: "center",
  },
  numberText: { color: colors.green, fontWeight: "600" },
  arrow: { color: colors.green, fontSize: 23 },
  card: {
    padding: 21,
    backgroundColor: "#FFF",
    borderRadius: 18,
    marginBottom: 16,
  },
  prose: {
    textAlign: "right",
    fontSize: 16,
    lineHeight: 30,
    color: colors.ink,
    marginVertical: 8,
  },
  page: {
    backgroundColor: "#FFFDF6",
    borderWidth: 1,
    borderColor: "#E3D8B9",
    padding: 20,
    borderRadius: 16,
  },
  basmala: {
    fontSize: 24,
    textAlign: "center",
    color: colors.ink,
    marginBottom: 20,
  },
  verse: {
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#F0ECDD",
  },
  quran: {
    fontSize: 27,
    lineHeight: 54,
    textAlign: "right",
    color: colors.ink,
  },
  verseNumber: { color: colors.gold, fontSize: 21 },
  chips: {
    flexDirection: "row-reverse",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 17,
  },
  chip: { backgroundColor: "#EAF0E8", borderRadius: 20, padding: 12 },
  overlay: { flex: 1, backgroundColor: "#0007", justifyContent: "flex-end" },
  sheet: {
    backgroundColor: colors.paper,
    borderTopLeftRadius: 25,
    borderTopRightRadius: 25,
    padding: 24,
    paddingBottom: 40,
    maxHeight: "90%",
  },
});

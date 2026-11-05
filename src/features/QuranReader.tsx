import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Modal, PanResponder, Pressable, ScrollView, type ScrollViewInstance, StyleSheet, Text, TextInput, useWindowDimensions, View } from "react-native";
import { surahs, quranSource } from "../content";
import { normalizeChapterSearch } from "../learning";
import { boundedPage, mushafChapters, mushafJuz, mushafPageCount, mushafPages, pageForVerse, pageSections, parsePageNumber, swipePageDelta } from "./mushaf";
import { useReaderDesktop } from "./useReaderDesktop";
import QuranVerse from "./QuranVerse";
const arabic = (number: number) => number.toLocaleString("ar-SA");
type IndexTab = "السور" | "الأجزاء" | "الصفحات";
type Props = { bookmark: {id: number; verse: number} | null; onRemoveBookmark: () => void; initialChapter: number; initialVerse?: number; interactionEnabled: boolean; onExit: () => void; onVersePress: (chapter: number, verse: number) => void };
export default function QuranReader({ bookmark, onRemoveBookmark, initialChapter, initialVerse = 1, interactionEnabled, onExit, onVersePress }: Props) {
  const { width, height } = useWindowDimensions();
  const [bodySize, setBodySize] = useState({ width: 0, height: 0 });
  const [page, setPage] = useState(() => pageForVerse(initialChapter, initialVerse));
  const [indexOpen, setIndexOpen] = useState(false);
  const [focusVerse, setFocusVerse] = useState<{chapter: number; verse: number} | null>({chapter: initialChapter, verse: initialVerse});
  const [indexTab, setIndexTab] = useState<IndexTab>("السور");
  const [search, setSearch] = useState("");
  const [pageInput, setPageInput] = useState("");
  const [pageError, setPageError] = useState("");
  const [fontAdjustment, setFontAdjustment] = useState(0);
  const content = useRef<ScrollViewInstance>(null);
  const sections = useMemo(() => pageSections(page), [page]);
  const current = mushafPages[page-1];
  const enabled = interactionEnabled && !indexOpen;
  const turn = useCallback((delta: number) => { setFocusVerse(null); setPage(previous => boundedPage(previous+delta)); }, []);
  useReaderDesktop(turn, enabled);
  useEffect(() => { content.current?.scrollTo({ y: 0, animated: false }); }, [page]);
  const gestures = useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponder: (_, gesture) => enabled && Math.abs(gesture.dx) > 14 && Math.abs(gesture.dx) > Math.abs(gesture.dy)*1.5,
    onMoveShouldSetPanResponderCapture: (_, gesture) => enabled && Math.abs(gesture.dx) > 14 && Math.abs(gesture.dx) > Math.abs(gesture.dy)*1.5,
    onPanResponderRelease: (_, gesture) => { if (enabled) { const delta = swipePageDelta(gesture.dx, gesture.dy); if (delta) turn(delta); } },
    onPanResponderTerminationRequest: () => true,
  }), [enabled, turn]);
  const choosePage = (number: number, focus: {chapter: number; verse: number} | null = null) => { setFocusVerse(focus); content.current?.scrollTo({y: 0, animated: false}); setPage(number); setIndexOpen(false); setPageError(""); };
  const submitPage = () => { const number = parsePageNumber(pageInput); if (number === null) setPageError("أدخل رقم صفحة من ١ إلى ٦٠٤."); else choosePage(number); };
  const normalSearch = normalizeChapterSearch(search);
  const listedSurahs = surahs.filter(chapter => normalizeChapterSearch(chapter.name).includes(normalSearch) || String(chapter.id) === normalSearch);
  const listedJuz = mushafJuz.filter(juz => !normalSearch || String(juz.number) === normalSearch || normalizeChapterSearch(surahs[juz.chapter-1].name).includes(normalSearch));
  const visibleCharacters = sections.reduce((count, section) => count+section.verses.reduce((sum, verse) => sum+verse.text.replace(/[\u0610-\u061a\u064b-\u065f\u0670\u06d6-\u06ed]/g, "").length+4, 0), 0);
  const textWidth = Math.max(180, Math.min(bodySize.width || width, 780)-62);
  const textHeight = Math.max(160, (bodySize.height || height-200)-90-sections.filter(section => section.showHeading).length*74-sections.filter(section => section.bismillah).length*60);
  const fittedSize = Math.floor(Math.sqrt(textWidth*textHeight/(Math.max(1, visibleCharacters)*0.9)));
  const baseFont = Math.max(16, Math.min(width < 420 ? 24 : width < 650 ? 27 : 31, fittedSize));
  const fontSize = Math.max(14, baseFont+fontAdjustment);
  const names = sections.map(section => section.name).join(" · ");
  return <View style={s.reader}>
    <View style={s.toolbar}>
      <Pressable accessibilityRole="button" accessibilityLabel="فتح فهرس المصحف" style={s.toolButton} onPress={() => { setIndexOpen(true); setSearch(""); setPageInput(String(page)); setPageError(""); }}><Text style={s.toolText}>☰ الفهرس</Text></Pressable>
      <Text numberOfLines={1} style={s.caption}>{names}</Text>
      <Pressable accessibilityRole="button" accessibilityLabel="إغلاق المصحف" style={s.toolButton} onPress={onExit}><Text style={s.toolText}>إغلاق ✕</Text></Pressable>
    </View>
    <View style={s.pageMeta}><Text style={s.metaText}>الجزء {arabic(current.juz)}{current.endJuz !== current.juz ? `–${arabic(current.endJuz)}` : ""}</Text><Text style={s.metaText}>المصحف الشريف</Text></View>
    <View nativeID="mushaf-gesture-surface" onLayout={event => { const size = event.nativeEvent.layout; setBodySize(previous => previous.width === size.width && previous.height === size.height ? previous : { width: size.width, height: size.height }); }} style={s.gestureSurface} {...gestures.panHandlers}>
      <ScrollView key="mushaf-page-scroll" ref={content} style={s.scroll} contentContainerStyle={s.pageContent} keyboardShouldPersistTaps="handled">
        <View style={s.paper} nativeID="mushaf-current-page">
          {sections.map(section => <View key={section.chapter}>
            {section.showHeading && <View style={s.surahFrame}><Text style={s.ornament}>✦</Text><Text accessibilityRole="header" style={s.surahName}>سورة {section.name}</Text><Text style={s.ornament}>✦</Text></View>}
            {!!section.bismillah && <Text style={[s.basmala, { fontSize: fontSize+1 }]}>{section.bismillah}</Text>}
            <Text style={[s.scripture, { fontSize, lineHeight: fontSize*1.9 }]}>
              {section.verses.map(verse => <QuranVerse key={`${verse.chapter}:${verse.verse}`}
                highlighted={focusVerse?.chapter === verse.chapter && focusVerse.verse === verse.verse}
                label={`سورة ${section.name}، الآية ${verse.verse}: ${verse.text}`} onPress={() => { if (enabled) onVersePress(verse.chapter, verse.verse); }}>
                {verse.text}{" "}<Text style={s.verseNumber}>﴿{arabic(verse.verse)}﴾</Text>{bookmark?.id === verse.chapter && bookmark.verse === verse.verse && <Text accessibilityLabel="موضع القراءة المحفوظ" style={s.bookmarkMark}> ★</Text>}{" "}
              </QuranVerse>)}
            </Text>
          </View>)}
          <Text style={s.paperPage}>{arabic(page)}</Text>
        </View>
      </ScrollView>
    </View>
    <View style={s.footer}>
      {bookmark && <View style={s.bookmarkControls}>
        <Pressable accessibilityRole="button" accessibilityLabel="متابعة الآية المحفوظة داخل المصحف" style={s.bookmarkResume} onPress={() => choosePage(pageForVerse(bookmark.id, bookmark.verse), {chapter: bookmark.id, verse: bookmark.verse})}><Text numberOfLines={1} style={s.toolText}>★ متابعة {surahs[bookmark.id-1].name} · الآية {arabic(bookmark.verse)}</Text></Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="إزالة حفظ موضع القراءة" style={s.toolButton} onPress={() => { if (focusVerse?.chapter === bookmark.id && focusVerse.verse === bookmark.verse) setFocusVerse(null); onRemoveBookmark(); }}><Text style={s.toolText}>إزالة الحفظ</Text></Pressable>
      </View>}
      <View style={s.controls}>
        <Pressable accessibilityRole="button" accessibilityLabel="الصفحة السابقة" accessibilityState={{ disabled: page === 1 }} disabled={page === 1 || !enabled} style={[s.pageButton, page === 1 && s.disabled]} onPress={() => turn(-1)}><Text style={s.toolText}>→ السابقة</Text></Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel={`الانتقال إلى صفحة، الحالية ${page}`} style={s.pageIndicator} onPress={() => { setIndexTab("الصفحات"); setPageInput(String(page)); setPageError(""); setIndexOpen(true); }}><Text accessibilityLiveRegion="polite" style={s.pageLabel}>صفحة {arabic(page)} من {arabic(mushafPageCount)}</Text></Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="الصفحة التالية" accessibilityState={{ disabled: page === mushafPageCount }} disabled={page === mushafPageCount || !enabled} style={[s.pageButton, page === mushafPageCount && s.disabled]} onPress={() => turn(1)}><Text style={s.toolText}>التالية ←</Text></Pressable>
      </View>
      <View style={s.bottomLine}>
        <View style={s.fontControls}><Pressable accessibilityRole="button" accessibilityLabel="تصغير خط المصحف" accessibilityState={{ disabled: fontAdjustment <= -6 || fontSize <= 14 }} disabled={fontAdjustment <= -6 || fontSize <= 14} style={s.fontButton} onPress={() => setFontAdjustment(value => value-1)}><Text style={s.toolText}>أ−</Text></Pressable><Pressable accessibilityRole="button" accessibilityLabel="تكبير خط المصحف" accessibilityState={{ disabled: fontAdjustment >= 8 }} disabled={fontAdjustment >= 8} style={s.fontButton} onPress={() => setFontAdjustment(value => value+1)}><Text style={s.toolText}>أ+</Text></Pressable></View>
        <Text style={s.hint}>اسحب يمينًا للتالية ويسارًا للسابقة</Text>
      </View>
      <Text style={s.source}>Tanzil · الرسم العثماني {quranSource.version} · tanzil.net</Text>
    </View>
    <Modal visible={indexOpen} transparent animationType="fade" onRequestClose={() => setIndexOpen(false)}>
      <View style={s.indexOverlay}>
        <Pressable style={s.backdrop} accessibilityRole="button" accessibilityLabel="إغلاق الفهرس والعودة للقراءة" onPress={() => setIndexOpen(false)} />
        <View style={s.indexPanel}>
          <View style={s.indexHeader}><Text accessibilityRole="header" style={s.indexTitle}>فهرس المصحف</Text><Pressable accessibilityRole="button" accessibilityLabel="إغلاق الفهرس" style={s.toolButton} onPress={() => setIndexOpen(false)}><Text style={s.toolText}>✕ إغلاق</Text></Pressable></View>
          <Text style={s.indexNote}>موضعك الحالي: صفحة {arabic(page)} · {names}</Text>
          <View style={s.tabs}>{(["السور", "الأجزاء", "الصفحات"] as IndexTab[]).map(tab => <Pressable accessibilityRole="tab" accessibilityState={{ selected: indexTab === tab }} key={tab} style={[s.tab, indexTab === tab && s.activeTab]} onPress={() => { setIndexTab(tab); setSearch(""); setPageError(""); }}><Text style={s.toolText}>{tab}</Text></Pressable>)}</View>
          {indexTab !== "الصفحات" && <TextInput nativeID="mushaf-index-search" accessibilityLabel="البحث في فهرس المصحف" style={s.input} placeholder={indexTab === "السور" ? "اسم السورة أو رقمها" : "رقم الجزء أو اسم السورة"} value={search} onChangeText={setSearch} />}
          {indexTab === "الصفحات" ? <View style={s.jumpCard}>
            <Text style={s.indexTitle}>الانتقال إلى صفحة</Text><Text style={s.indexNote}>أدخل رقمًا من ١ إلى ٦٠٤</Text>
            <TextInput nativeID="mushaf-page-input" accessibilityLabel="رقم صفحة المصحف" keyboardType="number-pad" style={s.input} value={pageInput} onChangeText={value => { setPageInput(value); setPageError(""); }} onSubmitEditing={submitPage} />
            {!!pageError && <Text accessibilityLiveRegion="polite" style={s.error}>{pageError}</Text>}
            <Pressable accessibilityRole="button" style={s.jumpButton} onPress={submitPage}><Text style={s.jumpText}>انتقل إلى الصفحة</Text></Pressable>
          </View> : <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 30 }}>
            {indexTab === "السور" && listedSurahs.map(chapter => { const chapterPage = mushafChapters[chapter.id-1].firstPage; const selected = sections.some(section => section.chapter === chapter.id); return <Pressable accessibilityRole="button" accessibilityLabel={`افتح سورة ${chapter.name}، صفحة ${chapterPage}`} accessibilityState={{ selected }} key={chapter.id} style={[s.indexRow, selected && s.currentRow]} onPress={() => choosePage(chapterPage, {chapter: chapter.id, verse: 1})}><Text style={s.indexNumber}>{arabic(chapter.id)}</Text><View style={{ flex: 1 }}><Text style={s.rowTitle}>سورة {chapter.name}</Text><Text style={s.indexNote}>{arabic(chapter.verses.length)} آيات · {chapter.place}</Text></View><Text style={s.rowPage}>ص {arabic(chapterPage)}</Text></Pressable>; })}
            {indexTab === "الأجزاء" && listedJuz.map(juz => <Pressable accessibilityRole="button" accessibilityLabel={`افتح الجزء ${juz.number}، صفحة ${juz.page}`} accessibilityState={{ selected: current.juz <= juz.number && current.endJuz >= juz.number }} key={juz.number} style={[s.indexRow, current.juz <= juz.number && current.endJuz >= juz.number && s.currentRow]} onPress={() => choosePage(juz.page, {chapter: juz.chapter, verse: juz.verse})}><Text style={s.indexNumber}>{arabic(juz.number)}</Text><View style={{ flex: 1 }}><Text style={s.rowTitle}>الجزء {arabic(juz.number)}</Text><Text style={s.indexNote}>{surahs[juz.chapter-1].name} · الآية {arabic(juz.verse)}</Text></View><Text style={s.rowPage}>ص {arabic(juz.page)}</Text></Pressable>)}
            {((indexTab === "السور" && !listedSurahs.length) || (indexTab === "الأجزاء" && !listedJuz.length)) && <Text style={s.indexNote}>لم نجد نتيجة بهذا الاسم أو الرقم.</Text>}
          </ScrollView>}
        </View>
      </View>
    </Modal>
  </View>;
}
const s = StyleSheet.create({
  reader: { flex: 1, backgroundColor: "#FFFDF6" },
  toolbar: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 12, minHeight: 54, borderBottomWidth: 1, borderBottomColor: "#E9E3D1" },
  toolButton: { padding: 10, minHeight: 44, justifyContent: "center" },
  toolText: { color: "#17624D", fontSize: 14, textAlign: "center" },
  caption: { flex: 1, textAlign: "center", color: "#193D35", fontSize: 15, paddingHorizontal: 8 },
  pageMeta: { flexDirection: "row-reverse", justifyContent: "space-between", paddingHorizontal: 24, paddingVertical: 8, width: "100%", maxWidth: 780, alignSelf: "center" },
  metaText: { fontSize: 12, color: "#85744F" },
  gestureSurface: { flex: 1 },
  scroll: { flex: 1 },
  pageContent: { flexGrow: 1, width: "100%", maxWidth: 780, alignSelf: "center", paddingHorizontal: 12, paddingBottom: 8 },
  paper: { flexGrow: 1, borderWidth: 1, borderColor: "#D9C89D", paddingHorizontal: 18, paddingVertical: 20, backgroundColor: "#FFFDF6" },
  surahFrame: { borderWidth: 1, borderColor: "#D9C89D", backgroundColor: "#F3EFDF", paddingVertical: 12, paddingHorizontal: 16, flexDirection: "row-reverse", justifyContent: "space-between", alignItems: "center", marginBottom: 16 },
  ornament: { color: "#BA9655", fontSize: 22 },
  surahName: { fontSize: 24, color: "#193D35", fontWeight: "600" },
  basmala: { lineHeight: 50, textAlign: "center", color: "#193D35", marginBottom: 10 },
  scripture: { color: "#193D35", textAlign: "center", writingDirection: "rtl", userSelect: "none" },
  verseNumber: { color: "#92713F" },
  bookmarkMark: { color: "#A78032", fontSize: 15 },
  bookmarkControls: { flexDirection: "row-reverse", alignItems: "center", gap: 8, borderBottomWidth: 1, borderBottomColor: "#E9E3D1" },
  bookmarkResume: { flex: 1, padding: 10, minHeight: 44, justifyContent: "center" },
  paperPage: { textAlign: "center", color: "#92713F", marginTop: 22, fontSize: 16 },
  footer: { borderTopWidth: 1, borderTopColor: "#E9E3D1", paddingHorizontal: 10, paddingBottom: 4, backgroundColor: "#F9F7EE" },
  controls: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between" },
  pageButton: { paddingHorizontal: 12, paddingVertical: 12, minHeight: 44 },
  disabled: { opacity: 0.35 },
  pageIndicator: { padding: 10, minHeight: 44, justifyContent: "center" },
  pageLabel: { textAlign: "center", color: "#193D35", fontSize: 13 },
  bottomLine: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between" },
  fontControls: { flexDirection: "row-reverse", gap: 4 },
  fontButton: { paddingHorizontal: 12, paddingVertical: 7, minWidth: 42, minHeight: 40, justifyContent: "center" },
  hint: { flexShrink: 1, fontSize: 11, color: "#738077", textAlign: "center" },
  source: { color: "#8C8D7F", fontSize: 10, textAlign: "center", marginBottom: 2 },
  indexOverlay: { flex: 1, backgroundColor: "#0006", justifyContent: "center", alignItems: "center", padding: 16 },
  backdrop: { position: "absolute", left: 0, right: 0, top: 0, bottom: 0 },
  indexPanel: { backgroundColor: "#F7F6EF", borderRadius: 20, width: "100%", maxWidth: 550, maxHeight: "90%", padding: 18, flexShrink: 1 },
  indexHeader: { flexDirection: "row-reverse", justifyContent: "space-between", alignItems: "center" },
  indexTitle: { color: "#193D35", fontSize: 21, fontWeight: "600", textAlign: "right" },
  indexNote: { color: "#738077", fontSize: 12, textAlign: "right", lineHeight: 23 },
  tabs: { flexDirection: "row-reverse", gap: 8, marginVertical: 14 },
  tab: { flex: 1, backgroundColor: "#EAF0E8", padding: 12, borderRadius: 10 },
  activeTab: { backgroundColor: "#D1E3D4" },
  input: { backgroundColor: "#FFF", borderColor: "#DDE4D9", borderWidth: 1, borderRadius: 12, padding: 13, fontSize: 16, textAlign: "right", marginBottom: 12 },
  indexRow: { flexDirection: "row-reverse", gap: 12, alignItems: "center", padding: 13, borderBottomColor: "#E3E8DE", borderBottomWidth: 1 },
  currentRow: { backgroundColor: "#E3EDE1", borderRadius: 10 },
  indexNumber: { color: "#92713F", fontSize: 15, minWidth: 28, textAlign: "center" },
  rowTitle: { color: "#193D35", fontSize: 17, textAlign: "right" },
  rowPage: { color: "#92713F", fontSize: 13 },
  jumpCard: { paddingVertical: 20 },
  jumpButton: { backgroundColor: "#17624D", padding: 15, borderRadius: 12, marginTop: 10 },
  jumpText: { color: "#FFF", fontSize: 15, textAlign: "center" },
  error: { color: "#A33B2B", fontSize: 13, textAlign: "right", marginVertical: 8 },
});

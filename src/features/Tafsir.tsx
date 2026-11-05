import { Pressable, ScrollView, Text, View, StyleSheet } from "react-native";
import {verseTafsir} from "../tafsir";
import { surahs } from "../content";
import { f } from "./featureStyles";
export default function Tafsir({
  chapter,
  verse,
  onClose,
}: {
  chapter: number;
  verse: number;
  onClose: () => void;
}) {
  const {entry, source: data} = verseTafsir(chapter, verse);
  const surah = surahs.find((s) => s.id === chapter);
  return (
    <View style={styles.overlay}>
      <View style={styles.sheet}>
        <Text style={f.title}>{data.edition}</Text>
        <Text style={f.note}>
          سورة {surah?.name} · الآية {verse.toLocaleString("ar-SA")}
        </Text>
        <ScrollView contentContainerStyle={{ paddingBottom: 16 }}>
          <Text style={f.verse}>{surah?.verses[verse - 1]}</Text>
          <Text selectable style={f.text}>
            {entry?.text ?? "تفسير هذه الآية غير متاح في النسخة الحالية."}
          </Text>
          <Text style={f.source}>
            النص: {data.edition} · بيانات Tafsir API، الإصدار {data.version}. محفوظ داخل التطبيق دون إعادة صياغة.
          </Text>
        </ScrollView>
        <Pressable
          accessibilityRole="button"
          style={f.button}
          onPress={onClose}
        >
          <Text style={f.buttonText}>إغلاق التفسير</Text>
        </Pressable>
      </View>
    </View>
  );
}
const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: "#0007", justifyContent: "flex-end" },
  sheet: {
    backgroundColor: "#F7F6EF",
    padding: 24,
    paddingBottom: 30,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: "92%",
    width: "100%",
    maxWidth: 800,
    alignSelf: "center",
  },
});

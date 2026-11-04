import React, { useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import { scholars } from "../content";
import { fatwas, searchFatwas, Fatwa } from "./fatwaIndex";
import { f } from "./featureStyles";
export default function Fatwas() {
  const [scholar, setScholar] = useState(scholars[0].name);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Fatwa | null>(null);
  const results = searchFatwas(fatwas, scholar, query);
  return (
    <>
      <Text style={f.title}>الفتاوى داخل أثر القرآن</Text>
      <Text style={f.note}>
        اختر الشيخ وابحث في النصوص المفهرسة. تعرض الفتوى الأصلية مع نسبتها
        ومصدرها، دون تحويلك إلى موقع آخر.
      </Text>
      <View style={f.row}>
        {scholars.map((s) => (
          <Pressable
            accessibilityRole="radio"
            accessibilityState={{ checked: scholar === s.name }}
            key={s.name}
            style={[f.chip, scholar === s.name && f.selected]}
            onPress={() => {
              setScholar(s.name);
              setSelected(null);
            }}
          >
            <Text style={f.label}>{s.name}</Text>
          </Pressable>
        ))}
      </View>
      <TextInput
        accessibilityLabel="البحث في الفتاوى"
        placeholder="اكتب موضوع الفتوى…"
        style={f.input}
        value={query}
        onChangeText={(q) => {
          setQuery(q);
          setSelected(null);
        }}
      />
      {selected ? (
        <View style={f.card}>
          <Pressable
            accessibilityRole="button"
            onPress={() => setSelected(null)}
            style={f.chip}
          >
            <Text style={f.label}>العودة إلى نتائج البحث →</Text>
          </Pressable>
          <Text style={f.title}>{selected.title}</Text>
          <Text style={f.note}>الشيخ {selected.scholar}</Text>
          <Text style={f.title}>السؤال</Text>
          <Text style={f.text}>{selected.question}</Text>
          <Text style={f.title}>الجواب</Text>
          <Text style={f.text}>{selected.answer}</Text>
          <Text selectable style={f.source}>
            المصدر: {selected.sourceUrl}
          </Text>
          <Text style={f.source}>تاريخ الاستيراد: {selected.retrievedAt}</Text>
        </View>
      ) : fatwas.some((f) => f.scholar === scholar) ? (
        <>
          <Text accessibilityLiveRegion="polite" style={f.note}>
            {results.length} نتيجة
          </Text>
          {results.map((x) => (
            <Pressable
              accessibilityRole="button"
              key={x.id}
              style={f.card}
              onPress={() => setSelected(x)}
            >
              <Text style={f.title}>{x.title}</Text>
              <Text style={f.text} numberOfLines={2}>
                {x.question}
              </Text>
              <Text style={f.note}>قراءة الفتوى داخل التطبيق ←</Text>
            </Pressable>
          ))}
          {!results.length && (
            <Text style={f.note}>
              لم نجد فتوى بهذه الكلمات في الفهرس المتاح. جرّب كلمات أخرى.
            </Text>
          )}
        </>
      ) : (
        <View style={f.card}>
          <Text style={f.title}>فهرس هذا الشيخ لم يُحمّل بعد</Text>
          <Text style={f.text}>
            البحث والقراءة داخل التطبيق جاهزان، لكن لم نستورد بعد نصوصًا موثقة
            من موقع الشيخ. لن نعرض إجابات مؤلفة أو نتائج تجريبية منسوبة إليه.
          </Text>
        </View>
      )}
    </>
  );
}

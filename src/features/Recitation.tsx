import React, { useEffect, useMemo, useRef, useState } from "react";
import { Pressable, Text, View } from "react-native";
import {
  ExpoSpeechRecognitionModule,
  useSpeechRecognitionEvent,
} from "expo-speech-recognition";
import { Surah } from "../content";
import { matchRecitation, normalizeArabic, RecitationProgress } from "./recitation";
import { f } from "./featureStyles";
import { openRecitationMicrophone } from "./recitationMicrophone";
import type { RecitationMicrophone } from "./recitationMicrophone";

export default function Recitation({ surah }: { surah: Surah }) {
  const verses = useMemo(
    () => surah.verses.map((verse) => normalizeArabic(verse).split(" ").filter(Boolean)),
    [surah],
  );
  const progress = useRef<RecitationProgress>({ verse: 0, pending: [] });
  const [completed, setCompleted] = useState(0);
  const [listening, setListening] = useState(false);
  const [recognizing, setRecognizing] = useState(false);
  const microphone = useRef<RecitationMicrophone | null>(null);
  const [holdingMicrophone, setHoldingMicrophone] = useState(false);
  const [message, setMessage] = useState("");
  const active = useRef(true);
  const wanted = useRef(false);
  const session = useRef(0);
  const retry = useRef<ReturnType<typeof setTimeout> | null>(null);
  const interruptions = useRef(0);
  const clearRetry = () => {
    if (retry.current) clearTimeout(retry.current);
    retry.current = null;
  };
  const stop = () => {
    session.current++;
    wanted.current = false;
    clearRetry();
    setListening(false);
    setRecognizing(false);
    setHoldingMicrophone(false);
    microphone.current?.stop();
    microphone.current = null;
    ExpoSpeechRecognitionModule.abort();
  };
  const beginRecognition = () => {
    if (!active.current || !wanted.current) return;
    try {
      ExpoSpeechRecognitionModule.start({
        lang: "ar-SA",
        interimResults: false,
        continuous: true,
        maxAlternatives: 1,
      });
    } catch {
      scheduleRetry("تعذّر بدء التعرّف مؤقتًا. نحاول الاتصال تلقائيًا؛ يمكنك إبقاء الجلسة مفتوحة.");
    }
  };
  const scheduleRetry = (notice?: string) => {
    if (!active.current || !wanted.current || retry.current) return;
    setRecognizing(false);
    if (notice) setMessage(notice);
    const delay = notice
      ? Math.min(15000, 600 * 2 ** Math.min(interruptions.current++, 5)) : 350;
    retry.current = setTimeout(() => {
      retry.current = null;
      beginRecognition();
    }, delay);
  };
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
      wanted.current = false;
      if (retry.current) clearTimeout(retry.current);
      microphone.current?.stop();
      microphone.current = null;
      try { ExpoSpeechRecognitionModule.abort(); } catch { /* Device unavailable. */ }
    };
  }, []);
  useSpeechRecognitionEvent("start", () => {
    if (!active.current) return;
    if (!wanted.current) { ExpoSpeechRecognitionModule.abort(); return; }
    setRecognizing(true);
  });
  useSpeechRecognitionEvent("end", () => {
    if (!active.current || !wanted.current) return;
    scheduleRetry();
  });
  useSpeechRecognitionEvent("error", (event) => {
    if (!active.current || !wanted.current) return;
    if (["network", "busy", "aborted", "no-speech", "speech-timeout"].includes(event.error)) {
      scheduleRetry(event.error === "network"
        ? "خدمة التعرّف الصوتي غير متصلة. نحاول الاتصال تلقائيًا. إذا استمر ذلك جرّب Google Chrome أو Microsoft Edge."
        : undefined);
      return;
    }
    stop();
    setMessage(event.error === "not-allowed"
      ? "لم يُسمح باستخدام الميكروفون. فعّل الإذن في المتصفح أو إعدادات الجهاز."
      : event.error === "service-not-allowed"
        ? "المتصفح لا يسمح بخدمة التعرّف الصوتي. جرّب Google Chrome أو Microsoft Edge."
        : event.error === "language-not-supported"
          ? "خدمة التعرّف الحالية لا تدعم العربية. جرّب Google Chrome أو Microsoft Edge."
          : event.error === "audio-capture"
            ? "تعذّر الوصول إلى الميكروفون. تحقق من توصيله وإعدادات الإدخال."
            : "خدمة التعرّف الصوتي غير متاحة في هذا المتصفح. جرّب Google Chrome أو Microsoft Edge.");
  });
  useSpeechRecognitionEvent("result", (event) => {
    if (!active.current || !wanted.current || !event.isFinal) return;
    interruptions.current = 0;
    setMessage("");
    const next = matchRecitation(verses, progress.current, event.results[0]?.transcript ?? "");
    progress.current = next;
    setCompleted(next.verse);
    if (next.verse === verses.length) {
      stop();
      setMessage("أتممت تسميع السورة. أحسنت!");
    }
  });
  const start = async () => {
    if (wanted.current || completed === verses.length) return;
    wanted.current = true;
    const request = ++session.current;
    setListening(true);
    setMessage("");
    interruptions.current = 0;
    try {
      if (!ExpoSpeechRecognitionModule.isRecognitionAvailable()) {
        wanted.current = false;
        setListening(false);
        setMessage("التعرّف الصوتي غير متاح هنا. على اللابتوب جرّب Chrome أو Edge عبر رابط HTTPS.");
        return;
      }
      const permission = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
      if (!active.current || !wanted.current || session.current !== request) return;
      if (!permission.granted) {
        wanted.current = false;
        setListening(false);
        setMessage("يلزم السماح بالميكروفون لبدء التسميع.");
        return;
      }
      const capture = await openRecitationMicrophone(() => {
        if (!active.current || !wanted.current || session.current !== request) return;
        stop();
        setMessage("انقطع الميكروفون أو أُوقف إذنه. تحقق منه ثم ابدأ التسميع مجددًا.");
      });
      if (!active.current || !wanted.current || session.current !== request) {
        capture.stop();
        return;
      }
      microphone.current = capture;
      setHoldingMicrophone(capture.active());
      beginRecognition();
    } catch {
      if (!active.current || session.current !== request) return;
      stop();
      setMessage("تعذّر فتح الميكروفون. اسمح باستخدامه وتحقق من اختيار جهاز الإدخال الصحيح.");
    }
  };

  return (
    <>
      <View style={f.card}>
        <Text style={f.title}>سمّع بصوتك</Text>
        <Text style={f.text}>
          اضغط ابدأ التسميع واقرأ من أول السورة. يستمر الميكروفون بالاستماع،
          وتظهر كل آية بعد مطابقتها كاملة. إذا أخطأت، أعد الآية ولن يظهر النص حتى تطابقها.
        </Text>
        <Pressable accessibilityRole="button" disabled={completed === verses.length}
          accessibilityState={{ disabled: completed === verses.length }} style={f.button}
          onPress={() => { if (wanted.current) stop(); else void start(); }}>
          <Text style={f.buttonText}>{listening ? "إيقاف التسميع" : "ابدأ التسميع"}</Text>
        </Pressable>
        <Text accessibilityLiveRegion="polite" style={f.note}>
          {!listening ? "الميكروفون متوقف" : recognizing
            ? "● نستمع لتسميعك الآن"
            : holdingMicrophone ? "● الميكروفون مفتوح · جارٍ استئناف التعرّف"
              : "جلسة التسميع مفعّلة · جارٍ تشغيل التعرّف"} · {completed} / {verses.length} آيات
        </Text>
        <Pressable accessibilityRole="button" style={f.chip} onPress={() => {
          stop();
          progress.current = { verse: 0, pending: [] };
          setCompleted(0);
          setMessage("");
        }}>
          <Text style={f.label}>إعادة التسميع من البداية</Text>
        </Pressable>
        {!!message && <Text accessibilityLiveRegion="polite" style={f.note}>{message}</Text>}
        <Text style={f.note}>
          قد يخطئ التعرّف الصوتي؛ المطابقة لا تقيّم التجويد أو مخارج الحروف.
          قد يعالج مزوّد المتصفح أو الجهاز الصوت، والتطبيق لا يحفظ التسجيل.
        </Text>
      </View>
      <View style={f.card}>
        {surah.verses.map((verse, i) => (
          <Text key={i} style={f.verse} accessibilityLabel={i < completed ? verse : `الآية ${i + 1} مخفية`}>
            <Text style={i < completed ? undefined : f.hidden}>{i < completed ? verse : "••• ••• •••"} </Text>
            <Text style={f.source}>﴿{(i + 1).toLocaleString("ar-SA")}﴾</Text>
          </Text>
        ))}
      </View>
    </>
  );
}

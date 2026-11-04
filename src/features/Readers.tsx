import React, { useEffect, useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import { useAudioPlayer, useAudioPlayerStatus } from "expo-audio";
import { f } from "./featureStyles";
type Moshaf = { id: number; name: string; server: string; surah_list: string };
type Reciter = { id: number; name: string; moshaf: Moshaf[] };
type Chapter = { id: number; name: string };
const API = "https://mp3quran.net/api/v3";
const time = (seconds: number) =>
  `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;
export default function Readers() {
  const [reciters, setReciters] = useState<Reciter[]>([]);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [selected, setSelected] = useState<Reciter | null>(null);
  const [moshaf, setMoshaf] = useState<Moshaf | null>(null);
  const [chapter, setChapter] = useState<Chapter | null>(null);
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const [loading, setLoading] = useState(true);
  const source =
    moshaf && chapter
      ? `${moshaf.server.replace(/\/$/, "")}/${String(chapter.id).padStart(3, "0")}.mp3`
      : null;
  const player = useAudioPlayer(source);
  const status = useAudioPlayerStatus(player);
  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    (async () => {
      try {
        const responses = await Promise.all([
          fetch(`${API}/reciters?language=ar`, { signal: controller.signal }),
          fetch(`${API}/suwar`, { signal: controller.signal }),
        ]);
        if (responses.some((r) => !r.ok)) throw Error();
        const [a, b] = await Promise.all(responses.map((r) => r.json()));
        if (!Array.isArray(a.reciters) || !Array.isArray(b.suwar))
          throw Error();
        const valid = a.reciters.filter(
          (r: Reciter) =>
            typeof r.id === "number" &&
            typeof r.name === "string" &&
            Array.isArray(r.moshaf) &&
            r.moshaf.some(
              (m) =>
                typeof m.server === "string" &&
                /^https:\/\//.test(m.server) &&
                typeof m.surah_list === "string",
            ),
        );
        if (active) {
          setReciters(valid);
          setChapters(
            b.suwar.filter(
              (s: Chapter) =>
                Number.isInteger(s.id) &&
                s.id >= 1 &&
                s.id <= 114 &&
                typeof s.name === "string",
            ),
          );
        }
      } catch {
        if (active)
          setError(
            "تعذّر تحميل فهرس التلاوات. تحقق من اتصالك ثم أعد المحاولة.",
          );
      } finally {
        clearTimeout(timeout);
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
      clearTimeout(timeout);
      controller.abort();
    };
  }, [retry]);
  const choose = (r: Reciter) => {
    player.pause();
    setSelected(r);
    setMoshaf(r.moshaf.find((m) => /^https:\/\//.test(m.server)) ?? null);
    setChapter(null);
    setQuery("");
  };
  const available = new Set(moshaf?.surah_list.split(",").map(Number));
  return (
    <>
      <Text style={f.title}>استمع إلى سورة كاملة</Text>
      <Text style={f.note}>
        اختر الشيخ ثم الرواية والسورة. التشغيل داخل التطبيق عبر مكتبة MP3Quran،
        ويحتاج الإنترنت.
      </Text>
      {loading && <Text style={f.text}>جارٍ تحميل القراء والسور…</Text>}
      {!!error && (
        <View>
          <Text style={f.error}>{error}</Text>
          <Pressable
            accessibilityRole="button"
            style={f.button}
            onPress={() => {
              setLoading(true);
              setError("");
              setRetry((x) => x + 1);
            }}
          >
            <Text style={f.buttonText}>إعادة المحاولة</Text>
          </Pressable>
        </View>
      )}
      {!!reciters.length && (
        <>
          <TextInput
            nativeID="reciter-search"
            accessibilityLabel="البحث عن قارئ"
            style={f.input}
            value={search}
            onChangeText={setSearch}
            placeholder="ابحث باسم الشيخ"
          />
          <View style={f.row}>
            {reciters
              .filter((r) => r.name.includes(search))
              .slice(0, search ? 30 : 8)
              .map((r) => (
                <Pressable
                  accessibilityRole="radio"
                  accessibilityState={{ checked: selected?.id === r.id }}
                  style={[f.chip, selected?.id === r.id && f.selected]}
                  key={r.id}
                  onPress={() => choose(r)}
                >
                  <Text style={f.label}>{r.name}</Text>
                </Pressable>
              ))}
          </View>
          <Text style={f.note}>اكتب اسم القارئ للوصول إلى بقية القراء.</Text>
        </>
      )}
      {selected && (
        <>
          <Text style={f.title}>{selected.name}</Text>
          <View style={f.row}>
            {selected.moshaf
              .filter((m) => /^https:\/\//.test(m.server))
              .map((m) => (
                <Pressable
                  accessibilityRole="radio"
                  accessibilityState={{ checked: moshaf?.id === m.id }}
                  key={m.id}
                  style={[f.chip, moshaf?.id === m.id && f.selected]}
                  onPress={() => {
                    player.pause();
                    setMoshaf(m);
                    setChapter(null);
                  }}
                >
                  <Text style={f.label}>{m.name}</Text>
                </Pressable>
              ))}
          </View>
        </>
      )}
      {chapter && (
        <View style={f.card}>
          <Text style={f.title}>
            سورة {chapter.name} · {selected?.name}
          </Text>
          <Text style={f.note}>{moshaf?.name}</Text>
          <Text style={f.text}>
            {time(status.currentTime)} / {time(status.duration)}
          </Text>
          {!!status.error && (
            <Text style={f.error}>
              تعذّر تحميل التسجيل. تحقق من الاتصال أو اختر سورة أخرى.
            </Text>
          )}
          {status.isBuffering && <Text style={f.note}>جارٍ تحميل الصوت…</Text>}
          <Pressable
            accessibilityRole="button"
            style={f.button}
            onPress={async () => {
              try {
                if (status.playing) player.pause();
                else {
                  if (
                    status.didJustFinish ||
                    (status.duration > 0 &&
                      status.currentTime >= status.duration)
                  )
                    await player.seekTo(0);
                  player.play();
                }
              } catch {
                setError("تعذّر تشغيل الصوت. حاول مجددًا.");
              }
            }}
          >
            <Text style={f.buttonText}>
              {status.playing ? "إيقاف مؤقت" : "تشغيل السورة كاملة"}
            </Text>
          </Pressable>
          <View style={f.row}>
            {[-15, 15].map((delta) => (
              <Pressable
                accessibilityRole="button"
                key={delta}
                style={f.chip}
                onPress={() =>
                  void player
                    .seekTo(
                      Math.max(
                        0,
                        Math.min(
                          status.duration || 0,
                          status.currentTime + delta,
                        ),
                      ),
                    )
                    .catch(() => setError("تعذّر تغيير موضع التشغيل."))
                }
              >
                <Text style={f.label}>
                  {delta < 0 ? "رجوع ١٥ ثانية" : "تقديم ١٥ ثانية"}
                </Text>
              </Pressable>
            ))}
          </View>
          <Text style={f.source}>
            التلاوة: MP3Quran · لا يغادر المستخدم التطبيق.
          </Text>
        </View>
      )}
      {moshaf && (
        <>
          <TextInput
            nativeID="audio-surah-search"
            accessibilityLabel="البحث عن سورة للاستماع"
            placeholder="ابحث عن سورة"
            value={query}
            onChangeText={setQuery}
            style={f.input}
          />
          {chapters
            .filter((c) => available.has(c.id) && c.name.includes(query))
            .map((c) => (
              <Pressable
                accessibilityRole="button"
                key={c.id}
                style={[
                  f.chip,
                  { marginBottom: 8 },
                  chapter?.id === c.id && f.selected,
                ]}
                onPress={() => {
                  player.pause();
                  setChapter(c);
                  setError("");
                }}
              >
                <Text style={f.label}>
                  سورة {c.name} {chapter?.id === c.id ? " · محددة" : ""}
                </Text>
              </Pressable>
            ))}
        </>
      )}
    </>
  );
}

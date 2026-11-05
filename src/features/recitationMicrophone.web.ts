// Keep the browser microphone open for the user-controlled session, even when
// the browser speech service ends a recognition request. No audio is recorded.
export function observeMicrophoneActivity(stream: MediaStream, onActivity: (active: boolean) => void) {
  if (typeof AudioContext === "undefined") return () => {};
  let context: AudioContext;
  try { context = new AudioContext(); } catch { return () => {}; }
  let source: MediaStreamAudioSourceNode;
  let analyser: AnalyserNode;
  try {
    source = context.createMediaStreamSource(stream);
    analyser = context.createAnalyser();
    analyser.fftSize = 512;
    source.connect(analyser); // No speakers, recording, or upload.
  } catch {
    void context.close().catch(() => {});
    return () => {};
  }
  void context.resume().catch(() => {});
  const samples = new Float32Array(analyser.fftSize);
  let active = false;
  let quietFrames = 0;
  const timer = setInterval(() => {
    analyser.getFloatTimeDomainData(samples);
    const rms = Math.sqrt(samples.reduce((sum, value) => sum + value * value, 0) / samples.length);
    quietFrames = rms > 0.012 ? 0 : quietFrames + 1;
    const next = quietFrames < 4 && (rms > 0.012 || active);
    if (next !== active) { active = next; onActivity(next); }
  }, 80);
  let stopped = false;
  return () => {
    if (stopped) return;
    stopped = true;
    clearInterval(timer);
    source.disconnect();
    analyser.disconnect();
    void context.close().catch(() => {});
  };
}
export async function openRecitationMicrophone(onEnded: () => void, onActivity?: (active: boolean) => void) {
  if (!navigator.mediaDevices?.getUserMedia)
    throw new Error("MICROPHONE_UNAVAILABLE");
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const tracks = stream.getAudioTracks();
  for (const track of tracks) track.addEventListener("ended", onEnded);
  let stopActivity = () => {};
  try { if (onActivity) stopActivity = observeMicrophoneActivity(stream, onActivity); }
  catch { /* Activity feedback is optional; speech capture must still work. */ }
  return {
    active: () => tracks.some((track) => track.readyState === "live"),
    stop: () => {
      stopActivity();
      for (const track of tracks) {
        track.removeEventListener("ended", onEnded);
        track.stop();
      }
    },
  };
}

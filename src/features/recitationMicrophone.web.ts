// Keep the browser microphone open for the user-controlled session, even when
// the browser speech service ends a recognition request. No audio is recorded.
export async function openRecitationMicrophone(onEnded: () => void) {
  if (!navigator.mediaDevices?.getUserMedia)
    throw new Error("MICROPHONE_UNAVAILABLE");
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const tracks = stream.getAudioTracks();
  for (const track of tracks) track.addEventListener("ended", onEnded);
  return {
    active: () => tracks.some((track) => track.readyState === "live"),
    stop: () => {
      for (const track of tracks) {
        track.removeEventListener("ended", onEnded);
        track.stop();
      }
    },
  };
}

import test from "node:test";
import assert from "node:assert/strict";
import { openRecitationMicrophone } from "../src/features/recitationMicrophone.web.ts";

test("session capture stays open until stop and removes device-ended listeners", async () => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  let ended = 0;
  const track = new EventTarget();
  track.readyState = "live";
  track.stop = () => { track.readyState = "ended"; };
  Object.defineProperty(globalThis, "navigator", { configurable: true, value: { mediaDevices: {
    getUserMedia: async (options) => { assert.deepEqual(options, { audio: true }); return { getAudioTracks: () => [track] }; },
  } } });
  try {
    const capture = await openRecitationMicrophone(() => ended++);
    assert.equal(capture.active(), true);
    track.dispatchEvent(new Event("ended"));
    assert.equal(ended, 1);
    capture.stop();
    assert.equal(capture.active(), false);
    track.dispatchEvent(new Event("ended"));
    assert.equal(ended, 1);
  } finally {
    if (previous) Object.defineProperty(globalThis, "navigator", previous);
    else delete globalThis.navigator;
  }
});

test("local audio activity responds before transcription, settles after silence, and releases audio resources", async () => {
  const { observeMicrophoneActivity } = await import("../src/features/recitationMicrophone.web.ts");
  const previous = Object.getOwnPropertyDescriptor(globalThis, "AudioContext");
  let amplitude = 0.03;
  let closed = 0;
  let disconnected = 0;
  const states = [];
  class Context {
    createMediaStreamSource() { return { connect() {}, disconnect() { disconnected++; } }; }
    createAnalyser() { return { fftSize: 512, getFloatTimeDomainData(values) { values.fill(amplitude); }, disconnect() { disconnected++; } }; }
    resume() { return Promise.resolve(); }
    close() { closed++; return Promise.resolve(); }
  }
  Object.defineProperty(globalThis, "AudioContext", { configurable: true, value: Context });
  let stop = () => {};
  try {
    stop = observeMicrophoneActivity({}, value => states.push(value));
    await new Promise(resolve => setTimeout(resolve, 140));
    assert.deepEqual(states, [true]);
    amplitude = 0;
    await new Promise(resolve => setTimeout(resolve, 400));
    assert.deepEqual(states, [true, false]);
    stop();
    assert.equal(closed, 1);
    assert.equal(disconnected, 2);
    amplitude = 0.03;
    await new Promise(resolve => setTimeout(resolve, 120));
    assert.deepEqual(states, [true, false]);
  } finally {
    stop();
    if (previous) Object.defineProperty(globalThis, "AudioContext", previous);
    else delete globalThis.AudioContext;
  }
});

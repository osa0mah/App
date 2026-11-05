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

export type RecitationMicrophone = { active: () => boolean; stop: () => void };
// Native audio capture is managed by the speech recognition module.
export async function openRecitationMicrophone(
  _onEnded: () => void,
  _onActivity?: (active: boolean) => void,
): Promise<RecitationMicrophone> {
  return { active: () => false, stop: () => {} };
}

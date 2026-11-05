const hosts = ["www.alfawzan.af.org.sa", "alfawzan.af.org.sa"];
function location(value) {
  const archive = new URL(value);
  if (archive.protocol !== "https:" || archive.hostname !== "web.archive.org" || archive.port || archive.username || archive.password || archive.search || archive.hash) return null;
  const match = archive.pathname.match(/^\/web\/(\d{14})id_\/(https?:\/\/.+)$/);
  if (!match) return null;
  const original = new URL(match[2]);
  if (!hosts.includes(original.hostname) || original.port || original.username || original.password || original.search || original.hash) return null;
  const stamp = match[1];
  const date = `${stamp.slice(0,4)}-${stamp.slice(4,6)}-${stamp.slice(6,8)}T${stamp.slice(8,10)}:${stamp.slice(10,12)}:${stamp.slice(12,14)}Z`;
  if (!Number.isFinite(Date.parse(date)) || new Date(date).toISOString().slice(0,19) !== date.slice(0,19)) return null;
  return { url: archive.href, original, date };
}
export function validateArchiveAudio(row) {
  if (row?.provider !== "alfawzan" || row.contentKind !== "archived-audio") return null;
  try {
    const source = new URL(row.sourceUrl);
    if (source.protocol !== "https:" || !hosts.includes(source.hostname) || source.port || source.username || source.password || source.search || source.hash || source.pathname !== row.id) return null;
    if (!/^(?:\/ar\/node\/\d+\/?|\/sites\/default\/files\/[^?#]+[.]mp3)$/i.test(source.pathname)) return null;
    const page = location(row.archiveUrl);
    const audio = location(row.audioUrl || row.archiveUrl);
    if (!page || !audio || page.original.hostname !== source.hostname || page.original.pathname !== source.pathname || !/^\/sites\/default\/files\/[^?#]+[.]mp3$/i.test(audio.original.pathname)) return null;
    if (/[.]mp3$/i.test(source.pathname) && audio.original.pathname !== source.pathname) return null;
    return { contentKind: "archived-audio", archiveUrl: page.url, archivedAt: page.date,
      audioUrl: audio.url, audioArchivedAt: audio.date,
      question: typeof row.question === "string" ? row.question.trim().slice(0,12000) : "" };
  } catch { return null; }
}
export function archivedAudioFatwa(row, scholar, retrievedAt) {
  const archive = validateArchiveAudio(row);
  if (!archive) return null;
  return { id: row.id, scholar, title: row.title, answer: "", sourceUrl: row.sourceUrl,
    ...archive, retrievedAt: retrievedAt.slice(0,10) };
}

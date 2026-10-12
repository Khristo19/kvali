// Turns the recorded run into an MP4 under 3 minutes: normal speed for the captioned steps, fast for the marked chain waits.
// Usage: node video/make-video.mjs  (reads video-out/marks.json, rec-start.txt and the screen capture screen.mp4, writes video-out/kvali-technical-demo.mp4)
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

const TARGET = 170; // seconds, leaves room under the 3-minute limit
const { t0Epoch, fast, total } = JSON.parse(readFileSync("video-out/marks.json", "utf8"));
const src = "video-out/screen.mp4"; // ffmpeg x11grab of the virtual display, started before the test
const recStart = Number(readFileSync("video-out/rec-start.txt", "utf8").trim());
const lead = Math.max(0, t0Epoch - recStart); // seconds of screen before the test clock started
const dur = Number(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", src]).toString().trim());
const end = Math.min(dur, lead + total); // the screen after the closing card is dropped
console.log(`screen ${dur.toFixed(1)}s, test from ${lead.toFixed(1)}s to ${end.toFixed(1)}s`);

// Segments: [start, end, fast?]
const segs = [];
let t = lead;
for (const f of fast) {
  const s = f.start + lead, e = Math.min(f.end + lead, end);
  if (e <= s || s < t) continue;
  if (s > t) segs.push([t, s, false]);
  segs.push([s, e, true]);
  t = e;
}
if (t < end) segs.push([t, end, false]);
const normal = segs.filter((x) => !x[2]).reduce((n, x) => n + x[1] - x[0], 0);
const slow = segs.filter((x) => x[2]).reduce((n, x) => n + x[1] - x[0], 0);
const room = Math.max(TARGET - normal, segs.filter((x) => x[2]).length * 1.2);
const k = slow > 0 ? Math.min(60, Math.max(4, slow / room)) : 1;
console.log(`recording ${(end - lead).toFixed(1)}s: normal ${normal.toFixed(1)}s, waits ${slow.toFixed(1)}s at ${k.toFixed(1)}x -> about ${(normal + slow / k).toFixed(1)}s`);
if (normal + slow / k > 179) console.warn("WARNING: the video is longer than 3 minutes");

// Cut and re-time each section on its own, then join them: light on memory, unlike one filter graph over the whole capture.
mkdirSync("video-out/parts", { recursive: true });
const list = segs.map(([s, e, f], i) => {
  const file = `video-out/parts/p${String(i).padStart(2, "0")}.mp4`;
  const speed = f ? k : 1;
  execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-ss", s.toFixed(3), "-to", e.toFixed(3), "-i", src, "-an", "-vf", `setpts=(PTS-STARTPTS)/${speed.toFixed(3)},fps=30,format=yuv420p`, "-c:v", "libx264", "-preset", "medium", "-crf", "16", "-profile:v", "high", file], { stdio: "inherit" });
  return `file '${file.replace("video-out/", "")}'`;
});
writeFileSync("video-out/parts.txt", list.join("\n") + "\n");
execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", "video-out/parts.txt", "-c", "copy", "-movflags", "+faststart", "video-out/kvali-technical-demo.mp4"], { stdio: "inherit" });
const out = Number(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", "video-out/kvali-technical-demo.mp4"]).toString().trim());
console.log(`MP4 length: ${out.toFixed(1)}s`);

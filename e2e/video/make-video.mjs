// Turns the recorded run into an MP4 under 3 minutes: normal speed for the captioned steps, fast for the marked chain waits.
// Usage: node video/make-video.mjs  (reads video-out/marks.json and the .webm under video-out/results, writes video-out/kvali-technical-demo.mp4)
import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const TARGET = 170; // seconds, leaves room under the 3-minute limit
const find = (dir) => readdirSync(dir).flatMap((f) => (statSync(join(dir, f)).isDirectory() ? find(join(dir, f)) : f.endsWith(".webm") ? [join(dir, f)] : []));
const webm = find("video-out/results")[0];
if (!webm) throw new Error("no video recorded");
const { fast, total } = JSON.parse(readFileSync("video-out/marks.json", "utf8"));
const dur = Number(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", webm]).toString().trim()) || total;
const lead = 0; // the video starts when the page opens, a fraction of a second before the test clock; the marks keep a margin

// Segments: [start, end, fast?]
const segs = [];
let t = 0;
for (const f of fast) {
  const s = f.start + lead, e = Math.min(f.end + lead, dur);
  if (e <= s || s < t) continue;
  if (s > t) segs.push([t, s, false]);
  segs.push([s, e, true]);
  t = e;
}
if (t < dur) segs.push([t, dur, false]);
const normal = segs.filter((x) => !x[2]).reduce((n, x) => n + x[1] - x[0], 0);
const slow = segs.filter((x) => x[2]).reduce((n, x) => n + x[1] - x[0], 0);
const room = Math.max(TARGET - normal, segs.filter((x) => x[2]).length * 1.2);
const k = slow > 0 ? Math.min(60, Math.max(4, slow / room)) : 1;
console.log(`recording ${dur.toFixed(1)}s: normal ${normal.toFixed(1)}s, waits ${slow.toFixed(1)}s at ${k.toFixed(1)}x -> about ${(normal + slow / k).toFixed(1)}s`);
if (normal + slow / k > 179) console.warn("WARNING: the video is longer than 3 minutes");

const parts = segs.map(([s, e, f], i) => `[0:v]trim=start=${s.toFixed(3)}:end=${e.toFixed(3)},setpts=(PTS-STARTPTS)/${f ? k.toFixed(3) : 1}[v${i}]`);
const filter = `${parts.join(";")};${segs.map((_, i) => `[v${i}]`).join("")}concat=n=${segs.length}:v=1:a=0,fps=30,scale=1920:1080:flags=lanczos,format=yuv420p[out]`;
execFileSync("ffmpeg", ["-y", "-i", webm, "-filter_complex", filter, "-map", "[out]", "-c:v", "libx264", "-preset", "slow", "-crf", "18", "-movflags", "+faststart", "video-out/kvali-technical-demo.mp4"], { stdio: "inherit" });
const out = Number(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", "video-out/kvali-technical-demo.mp4"]).toString().trim());
console.log(`MP4 length: ${out.toFixed(1)}s`);

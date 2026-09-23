// Usage: pnpm dev, Safari > Settings > Developer > Allow remote automation on,
// `safaridriver -p 4445 &` then `node scripts/check-app-safari.mjs` (env: APP_URL, SD_PORT, OUT, CLIP).
// The Chrome checks' essentials in a visible Safari window, stub mode: a graph
// saved before the registry refactor reloads with its edges and handles in place,
// the inspector opens on a selected card, Run all finishes with the composition
// taking video and audio, a real clip drop samples 8 frames (Safari's `seeked`
// and audio-track paths, the spec's two Safari risks), a non-video file is turned
// away, and Tab reaches Choose clip. CLIP defaults to a 6s test clip with a tone.
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const BASE = `http://localhost:${process.env.SD_PORT ?? 4445}`;
const APP = process.env.APP_URL ?? "http://localhost:3000";
const OUT = process.env.OUT ?? "./safari-app.png";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let CLIP = process.env.CLIP;
if (!CLIP) {
  CLIP = join(mkdtempSync(join(tmpdir(), "flow-safari-clip-")), "clip.mp4");
  execFileSync("ffmpeg", [
    "-loglevel", "error", "-y",
    "-f", "lavfi", "-i", "testsrc2=size=640x360:rate=24:duration=6",
    "-f", "lavfi", "-i", "sine=frequency=440:duration=6",
    "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "32", "-c:a", "aac", "-b:a", "64k",
    "-shortest", "-movflags", "+faststart", CLIP,
  ]);
}
const CLIP_B64 = readFileSync(CLIP).toString("base64");

// The persisted shape as the pre-registry cards wrote it, typed out by hand.
const node = (id, type, x, y, data) => ({ id, type, position: { x, y }, data: { status: "idle", ...data } });
const edge = (s, st, t, tt) => ({ id: `${s}-${t}`, source: s, target: t, sourceHandle: `${s}:${st}`, targetHandle: `${t}:${tt}` });
const SAVED = {
  nodes: [
    node("image-a", "image", 0, 0, { prompt: "a lighthouse at dusk", model: "flux-schnell" }),
    node("video-a", "video", 420, 0, { prompt: "slow push in", model: "seedance-2.0", duration: 6 }),
    node("tts-a", "tts", 420, 380, { prompt: "The light turns on.", voice: "Adam", model: "eleven_multilingual_v2" }),
    node("composition-a", "composition", 880, 100, {}),
  ],
  edges: [edge("image-a", "image", "video-a", "image"), edge("video-a", "video", "composition-a", "video"), edge("tts-a", "audio", "composition-a", "audio")],
};
const HANDLES = [
  ["image-a:text", "target", "24px"], ["image-a:image", "target", "56px"], ["image-a:image", "source", null],
  ["video-a:text", "target", "24px"], ["video-a:image", "target", "56px"], ["video-a:video", "source", null],
  ["tts-a:text", "target", null], ["tts-a:audio", "source", null],
  ["composition-a:video", "target", "24px"], ["composition-a:audio", "target", "56px"],
];

async function wd(method, path, body) {
  const res = await fetch(BASE + path, {
    method,
    headers: { "content-type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json();
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status} ${JSON.stringify(json.value).slice(0, 300)}`);
  return json.value;
}

const results = [];
const check = (name, ok, detail = "") => {
  results.push({ name, ok });
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? " · " + detail : ""}`);
};

const { sessionId: sid } = await wd("POST", "/session", { capabilities: { alwaysMatch: { browserName: "Safari" } } });
const S = (p) => `/session/${sid}${p}`;
const exec = (script, args = []) => wd("POST", S("/execute/sync"), { script, args });
const stored = () => exec(`return JSON.parse(localStorage.getItem("flow-builder-state")).state`);
const tab = () =>
  wd("POST", S("/actions"), { actions: [{ type: "key", id: "kb", actions: [{ type: "keyDown", value: "" }, { type: "keyUp", value: "" }] }] });
const load = async (state) => {
  await exec(`localStorage.clear(); ${state ? `localStorage.setItem("flow-builder-state", arguments[0]);` : ""} location.reload();`,
    state ? [JSON.stringify({ state, version: 0 })] : []);
  for (let i = 0; i < 40; i++) {
    await sleep(250);
    if (await exec("return document.readyState === 'complete' && Boolean(document.querySelector('.react-flow__controls'))")) break;
  }
  await sleep(500);
};
const overlaps = () => exec(`
  const boxes = [...document.querySelectorAll('.react-flow__node')].map(n => n.getBoundingClientRect());
  let hits = 0;
  for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
    const a = boxes[i], b = boxes[j];
    if (a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom) hits++;
  }
  return hits;`);

try {
  await wd("POST", S("/window/rect"), { x: 0, y: 0, width: 1440, height: 900 });
  await wd("POST", S("/url"), { url: APP });
  await sleep(1500);

  // 1. A graph saved before the refactor.
  await load(SAVED);
  check("every saved edge is drawn after the reload", (await exec("return document.querySelectorAll('.react-flow__edge').length")) === 3);
  const drawn = await exec(`return [...document.querySelectorAll('.react-flow__handle')].map(h => ({
    id: h.dataset.handleid, side: h.classList.contains('source') ? 'source' : 'target', top: h.style.top || null }))`);
  const misplaced = HANDLES.filter(([id, side, top]) => !drawn.some((d) => d.id === id && d.side === side && d.top === top));
  check("all 10 handles sit where the cards used to put them", drawn.length === 10 && misplaced.length === 0, misplaced.map((m) => m.join(" ")).join(", "));

  // 2. The inspector.
  await wd("POST", S(`/element/${(await wd("POST", S("/element"), { using: "css selector", value: '[data-id="video-a"]' }))["element-6066-11e4-a52e-4f735466cecf"]}/click`), {});
  await sleep(400);
  const panel = await exec("const a = document.querySelector('aside'); return a ? a.textContent : null");
  check("selecting the video card opens the inspector with model and duration", Boolean(panel) && panel.includes("Model") && panel.includes("Duration"), (panel ?? "none").slice(0, 60));

  // 3. Run all.
  await exec("[...document.querySelectorAll('button')].find(b => b.textContent.trim() === 'Run all').click()");
  let statuses = [];
  for (let i = 0; i < 60; i++) {
    await sleep(500);
    statuses = (await stored()).nodes.map((n) => n.data.status);
    if (statuses.every((s) => s === "done" || s === "error")) break;
  }
  const comp = (await stored()).nodes.find((n) => n.id === "composition-a").data;
  check("Run all takes every node to done", statuses.every((s) => s === "done"), statuses.join(","));
  check("the composition takes the video and the audio", Boolean(comp.videoUrl) && Boolean(comp.audioUrl));

  // 4. A real clip dropped on an empty canvas.
  await load(null);
  await exec(`
    const real = window.fetch;
    window.fetch = (url, init) => {
      if (String(url).includes("/api/analyze/clip")) window.__sent = JSON.parse(init.body);
      return real(url, init);
    };`);
  const drop = (b64, name, type) => exec(`
    const bytes = Uint8Array.from(atob(arguments[0]), (c) => c.charCodeAt(0));
    const dt = new DataTransfer();
    dt.items.add(new File([bytes], arguments[1], { type: arguments[2] }));
    document.querySelector(".react-flow__pane").dispatchEvent(new DragEvent("drop", { bubbles: true, cancelable: true, clientX: 300, clientY: 300, dataTransfer: dt }));
    return true;`, [b64, name, type]);
  await drop(CLIP_B64, "clip.mp4", "video/mp4");
  let ref;
  for (let i = 0; i < 80; i++) {
    await sleep(250);
    ref = (await stored()).nodes.find((n) => n.type === "reference");
    if (ref && ["done", "error"].includes(ref.data.status)) break;
  }
  check("the clip is read and the reference settles", ref?.data.status === "done", `${ref?.data.status}${ref?.data.error ? " · " + ref.data.error : ""}`);
  const sent = (await exec("return window.__sent")) ?? { frames: [] };
  const distinct = new Set(sent.frames.map((f) => f.dataUrl)).size;
  check("8 real, different frames from 0 to just before the end", sent.frames.length === 8 && distinct === 8 && sent.frames[7].t > 5.9 && sent.frames.every((f) => f.dataUrl.length > 5000),
    `${distinct} distinct · ${sent.frames.map((f) => f.t.toFixed(2)).join(" ")}`);
  console.log(`INFO Safari's audio guess for a clip with a tone: ${JSON.stringify(ref?.data.hasAudio)}`);
  check("Safari detects the clip's audio track", ref?.data.hasAudio === true, JSON.stringify(ref?.data.hasAudio));
  const state = await stored();
  check("the stub graph lands with its 3 edges", state.nodes.length === 5 && state.edges.length === 3, `${state.nodes.length} nodes, ${state.edges.length} edges`);
  check("the reference keeps a 3-frame strip", (await exec(`return document.querySelectorAll('.react-flow__node-reference img[alt^="Frame at"]').length`)) === 3);
  await exec("document.querySelector('.react-flow__controls-fitview').click()");
  await sleep(600);
  check("no two cards overlap", (await overlaps()) === 0);

  // 5. A file that is not a video.
  await drop(Buffer.from("notes").toString("base64"), "notes.txt", "text/plain");
  await sleep(600);
  check("a non-video file is turned away on the card", await exec(`return [...document.querySelectorAll(".react-flow__node-reference")].some((n) => n.textContent.includes("notes.txt is not a video"))`));

  // 6. Choose clip by keyboard. Safari's Tab skips buttons unless "Press Tab to
  // highlight each item" is on; it reached them in the safaridriver session this
  // script was written against, so a failure here may be that setting.
  let reached = false;
  for (let i = 0; i < 40 && !reached; i++) {
    await tab();
    reached = await exec("return document.activeElement?.textContent?.trim() === 'Choose clip'");
  }
  check("Tab reaches Choose clip", reached);

  writeFileSync(OUT, Buffer.from(await wd("GET", S("/screenshot")), "base64"));
  console.log("screenshot:", OUT);
} catch (err) {
  check("script completed", false, String(err.message ?? err));
} finally {
  await wd("DELETE", S("")).catch(() => {});
}
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);

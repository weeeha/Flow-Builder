// Usage: pnpm dev, then `node scripts/check-clip-drop-chrome.mjs` (env: APP_URL, CDP_PORT, OUT, CLIP).
// Build 11's thin slice end to end in stub mode: a video dropped on the canvas
// shows the overlay, samples 8 real frames for the analysis (keeping 3 on a
// reference node), and the stub
// graph lands beside it, wired, without moving what was already there; Run all
// then takes every node to done. CLIP defaults to a 6s test pattern with a tone,
// made with ffmpeg, so every sampled frame differs and the clip has audio.
import { execFileSync, spawn } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

let CLIP = process.env.CLIP;
if (!CLIP) {
  CLIP = join(mkdtempSync(join(tmpdir(), "flow-clip-src-")), "clip.mp4");
  execFileSync("ffmpeg", [
    "-loglevel", "error", "-y",
    "-f", "lavfi", "-i", "testsrc2=size=640x360:rate=24:duration=6",
    "-f", "lavfi", "-i", "sine=frequency=440:duration=6",
    "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "32", "-c:a", "aac", "-b:a", "64k",
    "-shortest", "-movflags", "+faststart", CLIP,
  ]);
}
const CLIP_B64 = readFileSync(CLIP).toString("base64");

// One node already on the canvas, in the saved shape, which the drop must not move.
const SAVED = {
  nodes: [{ id: "image-a", type: "image", position: { x: -600, y: 0 }, data: { status: "idle", prompt: "already here", model: "flux-dev" } }],
  edges: [],
};

const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const PORT = Number(process.env.CDP_PORT ?? 9341);
const APP = process.env.APP_URL ?? "http://localhost:3000";
const OUT = process.env.OUT ?? "./clip-drop.png";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const results = [];
const check = (name, ok, detail = "") => {
  results.push({ ok });
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? " · " + detail : ""}`);
};

const profile = mkdtempSync(join(tmpdir(), "flow-clip-"));
const chrome = spawn(CHROME, [
  "--headless=new",
  `--remote-debugging-port=${PORT}`,
  `--user-data-dir=${profile}`,
  "--window-size=1440,900",
  "--no-first-run",
  "--no-default-browser-check",
  "about:blank",
], { stdio: "ignore" });

let ws;
let nextId = 1;
let onEvent = () => {};
const pending = new Map();
function send(method, params = {}) {
  const id = nextId++;
  ws.send(JSON.stringify({ id, method, params }));
  return new Promise((resolve, reject) => pending.set(id, { resolve, reject, method }));
}
async function evaluate(expression) {
  const r = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? "evaluate failed");
  return r.result.value;
}
async function click(sel) {
  const box = await evaluate(
    `(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`
  );
  if (!box) throw new Error(`no element for ${sel}`);
  await send("Input.dispatchMouseEvent", { type: "mousePressed", x: box.x, y: box.y, button: "left", clickCount: 1 });
  await send("Input.dispatchMouseEvent", { type: "mouseReleased", x: box.x, y: box.y, button: "left", clickCount: 1 });
}

try {
  let target;
  for (let i = 0; i < 40 && !target; i++) {
    await sleep(250);
    target = await fetch(`http://localhost:${PORT}/json/list`).then((r) => r.json()).then((l) => l.find((t) => t.type === "page")).catch(() => null);
  }
  if (!target) throw new Error("Chrome did not expose a page target");
  ws = new WebSocket(target.webSocketDebuggerUrl);
  ws.addEventListener("message", (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.method) onEvent(msg);
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject, method } = pending.get(msg.id);
      pending.delete(msg.id);
      msg.error ? reject(new Error(`${method}: ${msg.error.message}`)) : resolve(msg.result);
    }
  });
  await new Promise((resolve, reject) => { ws.addEventListener("open", resolve); ws.addEventListener("error", reject); });
  await send("Page.enable");
  await send("Runtime.enable");
  await send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  await send("Page.navigate", { url: APP });
  for (let i = 0; i < 40; i++) {
    await sleep(250);
    if (await evaluate("Boolean(document.querySelector('.react-flow'))")) break;
  }
  await evaluate(`localStorage.setItem("flow-builder-state", ${JSON.stringify(JSON.stringify({ state: SAVED, version: 0 }))})`);
  const loaded = new Promise((resolve) => { onEvent = (m) => { if (m.method === "Page.loadEventFired") resolve(); }; });
  await send("Page.reload");
  await loaded;
  for (let i = 0; i < 40; i++) {
    await sleep(250);
    if (await evaluate("document.readyState === 'complete' && Boolean(document.querySelector('.react-flow__controls'))")) break;
  }

  const stored = () => evaluate(`JSON.parse(localStorage.getItem("flow-builder-state")).state`);

  // A synthetic drag carrying a real File, fired where a person would drop it.
  await evaluate(`(() => {
    const bytes = Uint8Array.from(atob(${JSON.stringify(CLIP_B64)}), (c) => c.charCodeAt(0));
    window.__clip = new File([bytes], "clip.mp4", { type: "video/mp4" });
  })()`);
  // Right onto the card already there: the reference and the graph must slide
  // clear of it (Nick's 8A), which "no two cards overlap" below checks.
  const fire = (type) => evaluate(`(() => {
    const dt = new DataTransfer();
    dt.items.add(window.__clip);
    const card = document.querySelector('[data-id="image-a"]').getBoundingClientRect();
    const target = document.querySelector(".react-flow__pane");
    target.dispatchEvent(new DragEvent(${JSON.stringify(type)}, { bubbles: true, cancelable: true, clientX: card.left + card.width / 2, clientY: card.top + card.height / 2, dataTransfer: dt }));
  })()`);

  // Record what the analysis is sent: the node keeps only 3 of the 8 frames.
  await evaluate(`(() => {
    const real = window.fetch;
    window.fetch = (url, init) => {
      if (String(url).includes("/api/analyze/clip")) window.__sent = JSON.parse(init.body);
      return real(url, init);
    };
  })()`);
  // Timestamp every card as it mounts, to see the staggered reveal.
  await evaluate(`(() => {
    window.__arrivals = [];
    new MutationObserver((records) => {
      for (const r of records) for (const n of r.addedNodes) {
        if (n.classList?.contains("react-flow__node")) window.__arrivals.push({ type: [...n.classList].find((c) => c.startsWith("react-flow__node-")).slice(17), at: performance.now() });
      }
    }).observe(document.querySelector(".react-flow__nodes"), { childList: true });
  })()`);
  await fire("dragover");
  await sleep(150);
  const overlay = await evaluate("[...document.querySelectorAll('span')].some(s => s.textContent === 'Drop to read the clip')");
  check("dragging a file shows the drop overlay", overlay);

  await fire("drop");
  await sleep(150);
  check("the overlay goes away on drop", !(await evaluate("[...document.querySelectorAll('span')].some(s => s.textContent === 'Drop to read the clip')")));

  let ref;
  for (let i = 0; i < 60; i++) {
    await sleep(250);
    ref = (await stored()).nodes.find((n) => n.type === "reference");
    if (ref && (ref.data.status === "done" || ref.data.status === "error")) break;
  }
  check("a reference node lands and finishes reading", ref?.data.status === "done", ref ? `${ref.data.status}${ref.data.error ? " · " + ref.data.error : ""}` : "none");

  const frames = (await evaluate("window.__sent"))?.frames ?? [];
  const distinct = new Set(frames.map((f) => f.dataUrl)).size;
  check("the analysis gets 8 sampled frames, first at 0 and last near the end", frames.length === 8 && frames[0].t === 0 && frames[7].t > 5.9 && frames[7].t < 6,
    frames.map((f) => f.t.toFixed(2)).join(" "));
  check("every frame is a real, different JPEG", distinct === 8 && frames.every((f) => f.dataUrl.startsWith("data:image/jpeg;base64,") && f.dataUrl.length > 5000),
    `${distinct} distinct, ${frames.map((f) => Math.round(f.dataUrl.length / 1024) + "KB").join(" ")}`);
  const kept = ref?.data.frames ?? [];
  check("the node keeps the first, middle and last of them", JSON.stringify(kept) === JSON.stringify([frames[0], frames[4], frames[7]]), kept.map((f) => f.t.toFixed(2)).join(" "));
  check("it read the clip's duration", Math.abs((ref?.data.duration ?? 0) - 6) < 0.1, String(ref?.data.duration));
  console.log(`INFO Chrome's audio guess for a clip with a tone: ${JSON.stringify(ref?.data.hasAudio)}`);
  check("it carries the stub's summary and path", ref?.data.summary === "1 shot, push-in, dusk" && ref?.data.path === "first pass", `${ref?.data.summary} · ${ref?.data.path}`);

  const arrivals = (await evaluate("window.__arrivals")).filter((a) => a.type !== "reference");
  const gaps = arrivals.slice(1).map((a, i) => Math.round(a.at - arrivals[i].at));
  check("the graph lands one card at a time, about 150ms apart", arrivals.length === 4 && gaps.every((g) => g >= 110 && g < 400),
    `${arrivals.map((a) => a.type).join(" → ")} · gaps ${gaps.join(", ")}ms`);

  const state = await stored();
  const kinds = state.nodes.map((n) => n.type).sort().join(",");
  check("the stub graph lands beside it", kinds === "composition,image,image,reference,tts,video", kinds);
  check("its three edges are stored", state.edges.length === 3, `${state.edges.length}`);
  await sleep(400);
  check("and drawn", (await evaluate("document.querySelectorAll('.react-flow__edge').length")) === 3);
  const before = state.nodes.find((n) => n.id === "image-a");
  check("the node that was already there did not move", before?.position.x === -600 && before?.position.y === 0 && before?.data.prompt === "already here");

  await evaluate("document.querySelector('.react-flow__controls-fitview').click()");
  await sleep(600);
  const overlaps = await evaluate(`(() => {
    const boxes = [...document.querySelectorAll('.react-flow__node')].map(n => ({ id: n.dataset.id, r: n.getBoundingClientRect() }));
    const hit = [];
    for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i].r, b = boxes[j].r;
      if (a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom) hit.push(boxes[i].id + "/" + boxes[j].id);
    }
    return hit;
  })()`);
  check("no two cards overlap", overlaps.length === 0, overlaps.join(", "));
  const storedKB = await evaluate(`Math.round(localStorage.getItem("flow-builder-state").length / 1024)`);
  console.log(`INFO persisted graph size with one clip: ${storedKB}KB`);

  // Reduced motion: a second clip's graph lands all at once.
  await send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });
  await evaluate("window.__arrivals = []");
  await fire("drop");
  for (let i = 0; i < 60; i++) {
    await sleep(250);
    const refs = (await stored()).nodes.filter((n) => n.type === "reference");
    if (refs.length === 2 && refs.every((r) => r.data.status === "done")) break;
  }
  const second = (await evaluate("window.__arrivals")).filter((a) => a.type !== "reference");
  const spread = second.length ? Math.round(second.at(-1).at - second[0].at) : -1;
  check("under reduced motion the second graph lands at once", second.length === 4 && spread < 50, `${second.length} cards within ${spread}ms`);
  await send("Emulation.setEmulatedMedia", { features: [] });
  await evaluate("document.querySelector('.react-flow__controls-fitview').click()");
  await sleep(600);
  const overlaps2 = await evaluate(`(() => {
    const boxes = [...document.querySelectorAll('.react-flow__node')].map(n => ({ id: n.dataset.id, r: n.getBoundingClientRect() }));
    const hit = [];
    for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i].r, b = boxes[j].r;
      if (a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom) hit.push(boxes[i].id + "/" + boxes[j].id);
    }
    return hit;
  })()`);
  check("a second drop in the same spot still overlaps nothing", overlaps2.length === 0, overlaps2.join(", "));

  const found = await evaluate("(() => { const b = [...document.querySelectorAll('button')].find(b => b.textContent.trim() === 'Run all'); b?.click(); return Boolean(b); })()");
  let statuses = {};
  for (let i = 0; i < 60; i++) {
    await sleep(500);
    statuses = Object.fromEntries((await stored()).nodes.map((n) => [n.type + ":" + n.id.slice(0, 12), n.data.status]));
    if (Object.values(statuses).every((s) => s === "done" || s === "error")) break;
  }
  check("Run all takes every node to done in stub mode", found && Object.values(statuses).every((s) => s === "done"), JSON.stringify(statuses));

  await evaluate("document.querySelector('.react-flow__controls-fitview').click()");
  await sleep(800);
  const shot = await send("Page.captureScreenshot", { format: "png" });
  writeFileSync(OUT, Buffer.from(shot.data, "base64"));
  console.log("screenshot:", OUT);
} catch (err) {
  check("script completed", false, String(err.message ?? err));
} finally {
  try { ws?.close(); } catch {}
  chrome.kill();
}
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);

// Usage: pnpm dev, then `node scripts/check-runall-chrome.mjs` (env: APP_URL, CDP_PORT, OUT).
// A graph saved before the registry refactor reloads with every edge attached and
// every handle where the cards used to put it, then Run all takes it to done in
// stub mode. Guards slice 3: BaseNode now draws the static ports from NODE_KINDS
// and the executor runs each kind through RUNNERS.
import { spawn } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

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
  edges: [
    edge("image-a", "image", "video-a", "image"),
    edge("video-a", "video", "composition-a", "video"),
    edge("tts-a", "audio", "composition-a", "audio"),
  ],
};

// Where the cards put each handle before slice 3: [handle id, side, CSS top or null for centred].
const HANDLES = [
  ["image-a:text", "target", "24px"], ["image-a:image", "target", "56px"], ["image-a:image", "source", null],
  ["video-a:text", "target", "24px"], ["video-a:image", "target", "56px"], ["video-a:video", "source", null],
  ["tts-a:text", "target", null], ["tts-a:audio", "source", null],
  ["composition-a:video", "target", "24px"], ["composition-a:audio", "target", "56px"],
];

const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const PORT = Number(process.env.CDP_PORT ?? 9339);
const APP = process.env.APP_URL ?? "http://localhost:3000";
const OUT = process.env.OUT ?? "./runall.png";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const results = [];
const check = (name, ok, detail = "") => {
  results.push({ ok });
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? " · " + detail : ""}`);
};

const profile = mkdtempSync(join(tmpdir(), "flow-runall-"));
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

  const edges = await evaluate("document.querySelectorAll('.react-flow__edge').length");
  check("every saved edge is drawn after the reload", edges === SAVED.edges.length, `${edges} edges`);

  const drawn = await evaluate(`[...document.querySelectorAll('.react-flow__handle')].map(h => ({
    id: h.dataset.handleid, side: h.classList.contains('source') ? 'source' : 'target',
    top: h.style.top || null }))`);
  check("each card draws exactly its old handles", drawn.length === HANDLES.length, `${drawn.length} handles`);
  for (const [id, side, top] of HANDLES) {
    const h = drawn.find((d) => d.id === id && d.side === side);
    check(`${id} ${side} sits ${top ?? "centred"}`, Boolean(h) && h.top === top, h ? `top ${h.top ?? "centred"}` : "missing");
  }

  const found = await evaluate("(() => { const b = [...document.querySelectorAll('button')].find(b => b.textContent.trim() === 'Run all'); b?.click(); return Boolean(b); })()");
  let statuses = {};
  for (let i = 0; i < 60; i++) {
    await sleep(500);
    statuses = await evaluate(`Object.fromEntries(JSON.parse(localStorage.getItem("flow-builder-state")).state.nodes.map(n => [n.id, n.data.status]))`);
    if (Object.values(statuses).every((s) => s === "done" || s === "error")) break;
  }
  check("Run all takes every node to done", found && Object.values(statuses).every((s) => s === "done"), JSON.stringify(statuses));
  const comp = await evaluate(`JSON.parse(localStorage.getItem("flow-builder-state")).state.nodes.find(n => n.id === "composition-a").data`);
  const video = await evaluate(`JSON.parse(localStorage.getItem("flow-builder-state")).state.nodes.find(n => n.id === "video-a").data`);
  check("composition picks up the video's output", Boolean(comp.videoUrl) && comp.videoUrl === video.outputUrl, comp.videoUrl ?? "none");

  // Call click() on the control itself: Next's dev badge sits on top of Fit View,
  // so a mouse event at those coordinates opens the dev overlay instead.
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

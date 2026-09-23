// Usage: pnpm dev, then `node scripts/check-clip-errors-chrome.mjs` (env: APP_URL, CDP_PORT, OUT).
// Build 11 task 12 in stub mode: Choose clip reached by Tab and opened with
// Enter; a non-video file turned away on the card; a clip over a minute read
// from its first 60s; and a failed analysis offering the empty image → video
// skeleton, which lands on request. Clips are made with ffmpeg.
import { execFileSync, spawn } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const dir = mkdtempSync(join(tmpdir(), "flow-clip-err-src-"));
const makeClip = (name, seconds) => {
  const path = join(dir, name);
  execFileSync("ffmpeg", [
    "-loglevel", "error", "-y",
    "-f", "lavfi", "-i", `testsrc2=size=320x180:rate=10:duration=${seconds}`,
    "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "36", "-movflags", "+faststart", path,
  ]);
  return path;
};
const SHORT = makeClip("short.mp4", 4);
const LONG = makeClip("long.mp4", 70);

const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const PORT = Number(process.env.CDP_PORT ?? 9343);
const APP = process.env.APP_URL ?? "http://localhost:3000";
const OUT = process.env.OUT ?? "./clip-errors.png";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const results = [];
const check = (name, ok, detail = "") => {
  results.push({ ok });
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? " · " + detail : ""}`);
};

const profile = mkdtempSync(join(tmpdir(), "flow-clip-err-"));
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
  await evaluate("localStorage.clear()");
  const loaded = new Promise((resolve) => { onEvent = (m) => { if (m.method === "Page.loadEventFired") resolve(); }; });
  await send("Page.reload");
  await loaded;
  for (let i = 0; i < 40; i++) {
    await sleep(250);
    if (await evaluate("document.readyState === 'complete' && Boolean(document.querySelector('.react-flow__controls'))")) break;
  }

  const stored = () => evaluate(`JSON.parse(localStorage.getItem("flow-builder-state")).state`);
  const refs = async () => (await stored()).nodes.filter((n) => n.type === "reference");
  const settled = async (count) => {
    for (let i = 0; i < 80; i++) {
      await sleep(250);
      const r = await refs();
      if (r.length === count && ["done", "error"].includes(r.at(-1).data.status)) return r.at(-1);
    }
    return (await refs()).at(-1);
  };
  // Drop a file at an empty spot, left of everything so far.
  const drop = (b64, name, type) => evaluate(`(() => {
    const bytes = Uint8Array.from(atob(${JSON.stringify(b64)}), (c) => c.charCodeAt(0));
    const dt = new DataTransfer();
    dt.items.add(new File([bytes], ${JSON.stringify(name)}, { type: ${JSON.stringify(type)} }));
    document.querySelector(".react-flow__pane").dispatchEvent(new DragEvent("drop", { bubbles: true, cancelable: true, clientX: 200, clientY: 200, dataTransfer: dt }));
  })()`);

  // 1. Choose clip, by keyboard only.
  let tabs = 0;
  for (; tabs < 40; tabs++) {
    if (await evaluate("document.activeElement?.textContent?.trim() === 'Choose clip'")) break;
    await send("Input.dispatchKeyEvent", { type: "rawKeyDown", key: "Tab", code: "Tab", windowsVirtualKeyCode: 9 });
    await send("Input.dispatchKeyEvent", { type: "keyUp", key: "Tab", code: "Tab", windowsVirtualKeyCode: 9 });
  }
  check("Tab reaches Choose clip", tabs < 40, `${tabs} presses`);
  await send("Page.setInterceptFileChooserDialog", { enabled: true });
  const chooser = new Promise((resolve) => { onEvent = (m) => { if (m.method === "Page.fileChooserOpened") resolve(m.params); }; });
  await send("Input.dispatchKeyEvent", { type: "keyDown", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13, text: "\r" });
  await send("Input.dispatchKeyEvent", { type: "keyUp", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13 });
  const opened = await Promise.race([chooser, sleep(3000).then(() => null)]);
  check("Enter opens a file chooser for video", Boolean(opened));
  if (opened) await send("DOM.setFileInputFiles", { files: [SHORT], backendNodeId: opened.backendNodeId });
  const chosen = await settled(1);
  check("the chosen clip is read into a graph", chosen?.data.status === "done" && (await stored()).nodes.length === 5,
    `${chosen?.data.status} · ${(await stored()).nodes.length} nodes`);

  // 2. A file that is not a video.
  await drop(Buffer.from("just some notes").toString("base64"), "notes.txt", "text/plain");
  const notes = await settled(2);
  check("a non-video file is turned away on the card", notes?.data.status === "error" && /notes\.txt is not a video/.test(notes.data.error ?? ""), notes?.data.error);
  const banner = await evaluate(`[...document.querySelectorAll(".react-flow__node-reference")].some((n) => n.textContent.includes("notes.txt is not a video"))`);
  check("and the red banner shows it", banner);

  // 3. A clip longer than a minute.
  await evaluate(`(() => {
    const real = window.fetch;
    window.fetch = (url, init) => {
      if (String(url).includes("/api/analyze/clip")) window.__sent = JSON.parse(init.body);
      return real(url, init);
    };
  })()`);
  await drop(readFileSync(LONG).toString("base64"), "long.mp4", "video/mp4");
  const long = await settled(3);
  const sent = await evaluate("window.__sent");
  const lastT = sent?.frames?.at(-1)?.t ?? -1;
  check("a 70s clip is read only over its first minute", long?.data.trimmed === true && lastT > 59 && lastT < 60 && Math.round(long.data.duration) === 70,
    `last frame at ${lastT.toFixed?.(2)}s, duration ${long?.data.duration}`);
  check("the card says so", await evaluate(`[...document.querySelectorAll(".react-flow__node-reference p[aria-live]")].some((p) => p.textContent.endsWith("first 60s of 1:10"))`));

  // 4. The analysis fails.
  await evaluate(`(() => {
    window.fetch = ((real) => (url, init) => String(url).includes("/api/analyze/clip")
      ? Promise.resolve(new Response(JSON.stringify({ error: "Analysis failed: gateway timeout" }), { status: 502 }))
      : real(url, init))(window.fetch);
  })()`);
  const before = (await stored()).nodes.length;
  await drop(readFileSync(SHORT).toString("base64"), "short.mp4", "video/mp4");
  const failed = await settled(4);
  check("a failed analysis shows on the card", failed?.data.status === "error" && failed.data.error === "Analysis failed: gateway timeout", failed?.data.error);
  const offer = await evaluate(`[...document.querySelectorAll("button")].filter((b) => b.textContent.includes("empty image → video")).length`);
  check("and offers the empty skeleton", offer === 1, `${offer} offers`);
  await evaluate(`[...document.querySelectorAll("button")].find((b) => b.textContent.includes("empty image → video")).click()`);
  await sleep(1200);
  const after = await stored();
  const landed = after.nodes.slice(before + 1).map((n) => n.type).join(",");
  const ref4 = after.nodes.find((n) => n.id === failed?.id);
  const [img, vid] = after.nodes.slice(before + 1);
  const wired = after.edges.some((e) => e.source === img?.id && e.target === vid?.id && e.sourceHandle.endsWith(":image") && e.targetHandle.endsWith(":image"));
  check("which lands image → video, wired, and settles the card as a fallback", landed === "image,video" && wired && ref4?.data.status === "done" && ref4?.data.path === "fallback",
    `${landed} · ${ref4?.data.status} · ${ref4?.data.path}`);

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

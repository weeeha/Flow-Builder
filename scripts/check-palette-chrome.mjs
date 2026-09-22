// Usage: pnpm dev, then `node scripts/check-palette-chrome.mjs` (env: APP_URL, CDP_PORT, OUT).
// Every kind in NODE_KINDS must be addable from the toolbar and mount a card whose
// header carries the table's label. Guards the derivation in node-toolbar.tsx and
// lib/store.ts: both read the table rather than their own lists.
import { spawn } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Kept in step with lib/node-kinds.ts by hand, on purpose: an independent copy is
// what makes this a check. Importing the table would only prove it equals itself.
const PALETTE = [
  ["image", "Image"],
  ["video", "Video"],
  ["tts", "Text to Speech"],
  ["composition", "Composition"],
  ["cluster", "Concept Cluster"],
];

const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const PORT = Number(process.env.CDP_PORT ?? 9335);
const APP = process.env.APP_URL ?? "http://localhost:3000";
const OUT = process.env.OUT ?? "./palette.png";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const results = [];
const check = (name, ok, detail = "") => {
  results.push({ ok });
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? " · " + detail : ""}`);
};

const profile = mkdtempSync(join(tmpdir(), "flow-palette-"));
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

  const buttons = await evaluate(
    "[...document.querySelectorAll('button[title^=\"Add \"]')].map(b => b.title.replace(/^Add /, ''))"
  );
  check(
    "the toolbar offers exactly the palette kinds, in table order",
    JSON.stringify(buttons) === JSON.stringify(PALETTE.map(([, label]) => label)),
    buttons.join(", ")
  );

  for (const [kind, label] of PALETTE) {
    await click(`button[title="Add ${label}"]`);
    await sleep(400);
    const mounted = await evaluate(`document.querySelectorAll('.react-flow__node-${kind}').length`);
    const header = await evaluate(
      `(() => { const n = document.querySelector('.react-flow__node-${kind}'); return n ? n.textContent.slice(0, ${label.length}) : null; })()`
    );
    check(`${kind}: one card mounts, headed "${label}"`, mounted === 1 && header === label, `mounted ${mounted}, header ${JSON.stringify(header)}`);
  }

  const total = await evaluate("document.querySelectorAll('.react-flow__node').length");
  check("every card is still on the canvas together", total === PALETTE.length, `${total} nodes`);

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

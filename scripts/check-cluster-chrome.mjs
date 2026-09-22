// Usage: pnpm dev, then `node scripts/check-cluster-chrome.mjs` (env: APP_URL, CDP_PORT, OUT).
// Drives headless Chrome (reports visibilityState "visible") over the DevTools
// protocol with real Input events and runs the same task-11 checks as
// safari-check.mjs.
import { spawn } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const PORT = Number(process.env.CDP_PORT ?? 9333);
const APP = process.env.APP_URL ?? "http://localhost:3000";
const OUT = process.env.OUT ?? "./chrome.png";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const results = [];
const check = (name, ok, detail = "") => {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? " · " + detail : ""}`);
};

const profile = mkdtempSync(join(tmpdir(), "flow-chrome-"));
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
const count = (sel) => evaluate(`document.querySelectorAll(${JSON.stringify(sel)}).length`);
const center = async (sel) => {
  const box = await evaluate(
    `(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`
  );
  if (!box) throw new Error(`no element for ${sel}`);
  return box;
};
async function click(sel) {
  const { x, y } = await center(sel);
  await send("Input.dispatchMouseEvent", { type: "mouseMoved", x, y });
  await send("Input.dispatchMouseEvent", { type: "mousePressed", x, y, button: "left", clickCount: 1 });
  await send("Input.dispatchMouseEvent", { type: "mouseReleased", x, y, button: "left", clickCount: 1 });
}
async function key(key, code, vk, text) {
  await send("Input.dispatchKeyEvent", { type: text ? "keyDown" : "rawKeyDown", key, code, windowsVirtualKeyCode: vk, ...(text ? { text } : {}) });
  await send("Input.dispatchKeyEvent", { type: "keyUp", key, code, windowsVirtualKeyCode: vk });
}
const tab = () => key("Tab", "Tab", 9);
const enter = () => key("Enter", "Enter", 13, "\r");
const space = () => key(" ", "Space", 32, " ");
const groupTexts = () =>
  evaluate(
    "[...document.querySelectorAll('[role=group][aria-label$=\" suggestions\"]')].map(g => [g.getAttribute('aria-label'), [...g.querySelectorAll('button[aria-pressed]')].map(b => b.textContent.trim())])"
  );

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
    if (await evaluate("Boolean(document.querySelector('button[title=\"Add Concept Cluster\"]'))")) break;
  }
  await evaluate("localStorage.clear()");
  const loaded = new Promise((resolve) => { onEvent = (m) => { if (m.method === "Page.loadEventFired") resolve(); }; });
  await send("Page.reload");
  await loaded;
  for (let i = 0; i < 40; i++) {
    await sleep(250);
    if (await evaluate("document.readyState === 'complete' && Boolean(document.querySelector('button[title=\"Add Concept Cluster\"]'))")) break;
  }
  check("page reports visible", (await evaluate("document.visibilityState")) === "visible");

  await click('button[title="Add Concept Cluster"]');
  await sleep(300);
  await click('textarea[aria-label="Seed prompt"]');
  let active = await evaluate("document.activeElement.getAttribute('aria-label') || document.activeElement.tagName");
  if (active !== "Seed prompt") {
    console.log("note: click did not focus the textarea (active:", active, "), focusing it directly");
    await evaluate("document.querySelector('textarea[aria-label=\"Seed prompt\"]').focus(); true");
  }
  await send("Input.insertText", { text: "a lighthouse at dusk" });
  await sleep(200);
  const typed = await evaluate("document.querySelector('textarea[aria-label=\"Seed prompt\"]').value");
  const runDisabled = await evaluate("document.querySelector('.react-flow__node-cluster button.bg-neutral-900').disabled");
  console.log(`note: textarea value=${JSON.stringify(typed)} runDisabled=${runDisabled}`);
  await click(".react-flow__node-cluster button.bg-neutral-900");
  let chips = 0;
  for (let i = 0; i < 25 && chips === 0; i++) {
    await sleep(300);
    chips = await count("button[aria-pressed]");
  }
  check("fixture chips render after Run", chips === 12, `${chips} chips`);

  await click('textarea[aria-label="Seed prompt"]');
  let focused = null;
  for (let i = 0; i < 8 && !focused; i++) {
    await tab();
    focused = await evaluate("(() => { const a = document.activeElement; return a && a.hasAttribute('aria-pressed') ? a.textContent.trim().slice(0, 40) : null; })()");
  }
  check("Tab reaches a chip", Boolean(focused), focused ?? "");
  check("focused chip matches :focus-visible", (await evaluate("document.activeElement.matches(':focus-visible')")) === true);
  await enter();
  check("Enter pins the chip", (await evaluate("document.activeElement.getAttribute('aria-pressed')")) === "true");
  await space();
  check("Space unpins it", (await evaluate("document.activeElement.getAttribute('aria-pressed')")) === "false");
  await enter();
  check("Enter pins it again", (await evaluate("document.activeElement.getAttribute('aria-pressed')")) === "true");
  check("a pin adds a text source handle", (await count('.react-flow__handle.source[data-handleid*=":text:"]')) === 1);

  await click('button[aria-label$="to video node"]');
  await sleep(500);
  check("to video adds a video node", (await count(".react-flow__node-video")) === 1);
  check("to video wires it", (await count(".react-flow__edge")) === 1);

  await evaluate("document.querySelectorAll('button[aria-pressed]')[1].scrollIntoView(); true");
  await click(".react-flow__node-cluster [role=group]:nth-of-type(1) li:nth-of-type(2) button[aria-pressed]");
  await sleep(300);
  const pinHandles = await evaluate("[...document.querySelectorAll('.react-flow__handle.source[data-handleid*=\":text:\"]')].map(h => h.dataset.handleid)");
  check("second pin adds a second handle", pinHandles.length === 2, pinHandles.join(", "));
  for (let i = 0; i < 6; i++) {
    const inView = await evaluate("(() => { const h = document.querySelector('.react-flow__node-video .react-flow__handle.target[data-handleid$=\":text\"]'); if (!h) return false; const r = h.getBoundingClientRect(); return r.left > 0 && r.right < innerWidth && r.top > 0 && r.bottom < innerHeight; })()");
    if (inView) break;
    await click(".react-flow__controls-zoomout");
    await sleep(200);
  }
  const src = await center(`.react-flow__handle.source[data-handleid="${pinHandles[1]}"]`);
  const dst = await center('.react-flow__node-video .react-flow__handle.target[data-handleid$=":text"]');
  await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: src.x, y: src.y });
  await send("Input.dispatchMouseEvent", { type: "mousePressed", x: src.x, y: src.y, button: "left", clickCount: 1 });
  for (let i = 1; i <= 8; i++) {
    await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: src.x + ((dst.x - src.x) * i) / 8, y: src.y + ((dst.y - src.y) * i) / 8, button: "left", buttons: 1 });
    await sleep(40);
  }
  await send("Input.dispatchMouseEvent", { type: "mouseReleased", x: dst.x, y: dst.y, button: "left", clickCount: 1 });
  await sleep(300);
  check("a pinned handle connects by drag", (await count(".react-flow__edge")) === 2, `${await count(".react-flow__edge")} edges`);

  const before = await groupTexts();
  await click('button[aria-label="Re-roll era"]');
  // Poll rather than sleep a fixed time: the first request to /api/generate/cluster
  // on a fresh dev server waits for Next to compile the route, which outlasts any
  // guess and reads as "the re-roll did nothing".
  let after = before;
  for (let i = 0; i < 40; i++) {
    await sleep(250);
    after = await groupTexts();
    if (JSON.stringify(after[1]) !== JSON.stringify(before[1])) break;
  }
  const same = (i) => JSON.stringify(before[i]) === JSON.stringify(after[i]);
  check("re-roll era changes only era", !same(1) && same(0) && same(2) && same(3));
  check("the two pins survive the re-roll", (await count('button[aria-pressed="true"]')) === 2);

  const shot = await send("Page.captureScreenshot", { format: "png" });
  writeFileSync(OUT, Buffer.from(shot.data, "base64"));
  console.log("screenshot:", OUT);
} catch (err) {
  check("script completed", false, String(err.message ?? err));
  try {
    console.log("debug url:", await evaluate("location.href"));
    console.log("debug buttons:", JSON.stringify(await evaluate("[...document.querySelectorAll('button')].slice(0, 12).map(b => b.getAttribute('aria-label') || b.getAttribute('title') || b.textContent.trim().slice(0, 20))")));
    console.log("debug body:", JSON.stringify(await evaluate("document.body.innerText.slice(0, 300)")));
  } catch (e) { console.log("debug failed:", e.message); }
} finally {
  try { ws?.close(); } catch {}
  chrome.kill();
}
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);

// Usage: pnpm dev, then `node scripts/check-inspector-chrome.mjs` (env: APP_URL, CDP_PORT, OUT).
// The inspector panel: appears for one selected node, edits it, closes on deselect,
// and stays non-modal so the canvas keeps working underneath.
import { spawn } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const PORT = Number(process.env.CDP_PORT ?? 9337);
const APP = process.env.APP_URL ?? "http://localhost:3000";
const OUT = process.env.OUT ?? "./inspector.png";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const check = (name, ok, detail = "") => { results.push(ok); console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? " · " + detail : ""}`); };

const chrome = spawn(CHROME, ["--headless=new", `--remote-debugging-port=${PORT}`, `--user-data-dir=${mkdtempSync(join(tmpdir(), "flow-inspector-"))}`, "--window-size=1600,1000", "--no-first-run", "--no-default-browser-check", "about:blank"], { stdio: "ignore" });
let ws, nextId = 1, onEvent = () => {};
const pending = new Map();
const send = (method, params = {}) => { const id = nextId++; ws.send(JSON.stringify({ id, method, params })); return new Promise((res, rej) => pending.set(id, { res, rej, method })); };
async function evaluate(expression) {
  const r = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? "evaluate failed");
  return r.result.value;
}
const center = async (sel) => {
  const box = await evaluate(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
  if (!box) throw new Error(`no element for ${sel}`);
  return box;
};
async function clickAt(x, y) {
  await send("Input.dispatchMouseEvent", { type: "mouseMoved", x, y });
  await send("Input.dispatchMouseEvent", { type: "mousePressed", x, y, button: "left", clickCount: 1 });
  await send("Input.dispatchMouseEvent", { type: "mouseReleased", x, y, button: "left", clickCount: 1 });
}
const click = async (sel) => { const { x, y } = await center(sel); await clickAt(x, y); };
const panelText = () => evaluate("(() => { const a = document.querySelector('aside'); return a ? a.innerText.replace(/\\n+/g, ' | ') : null; })()");
const trigger = (name) => `aside [data-slot="select-trigger"][aria-labelledby$="-${name}-label"]`;
// Radix does not put the value in an attribute, so pick the option by its label.
async function clickOption(label) {
  const box = await evaluate(`(() => {
    const o = [...document.querySelectorAll('[role="option"]')].find(e => e.textContent.trim().startsWith(${JSON.stringify(label)}));
    if (!o) return null;
    const r = o.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  })()`);
  if (!box) throw new Error(`no option labelled ${label}; open options: ` + JSON.stringify(await evaluate("[...document.querySelectorAll('[role=option]')].map(e => e.textContent.trim())")));
  await clickAt(box.x, box.y);
}

// A saved graph, so selection has something to act on.
const saved = { state: { nodes: [
  { id: "video-1", type: "video", position: { x: 0, y: 0 }, data: { status: "idle", prompt: "slow push in", model: "seedance-2.0", duration: 4 } },
  { id: "tts-1", type: "tts", position: { x: 460, y: 0 }, data: { status: "idle", prompt: "The lamp turns.", voice: "Rachel", model: "eleven_multilingual_v2" } },
  { id: "composition-1", type: "composition", position: { x: 900, y: 0 }, data: { status: "idle" } },
], edges: [] }, version: 0 };

try {
  let target;
  for (let i = 0; i < 40 && !target; i++) { await sleep(250); target = await fetch(`http://localhost:${PORT}/json/list`).then(r => r.json()).then(l => l.find(t => t.type === "page")).catch(() => null); }
  if (!target) throw new Error("Chrome did not expose a page target");
  ws = new WebSocket(target.webSocketDebuggerUrl);
  ws.addEventListener("message", (ev) => { const m = JSON.parse(ev.data); if (m.method) onEvent(m); if (m.id && pending.has(m.id)) { const { res, rej, method } = pending.get(m.id); pending.delete(m.id); m.error ? rej(new Error(`${method}: ${m.error.message}`)) : res(m.result); } });
  await new Promise((res, rej) => { ws.addEventListener("open", res); ws.addEventListener("error", rej); });
  await send("Page.enable"); await send("Runtime.enable");
  await send("Emulation.setDeviceMetricsOverride", { width: 1600, height: 1000, deviceScaleFactor: 1, mobile: false });
  await send("Page.navigate", { url: APP });
  for (let i = 0; i < 40; i++) { await sleep(250); if (await evaluate("Boolean(document.querySelector('.react-flow'))")) break; }
  await evaluate(`localStorage.setItem("flow-builder-state", ${JSON.stringify(JSON.stringify(saved))})`);
  const loaded = new Promise((r) => { onEvent = (m) => { if (m.method === "Page.loadEventFired") r(); }; });
  await send("Page.reload"); await loaded;
  for (let i = 0; i < 40; i++) { await sleep(250); if (await evaluate("document.querySelectorAll('.react-flow__node').length === 3")) break; }

  check("no panel until something is selected", (await evaluate("document.querySelectorAll('aside').length")) === 0);

  await click(".react-flow__node-video .react-flow__node-video, .react-flow__node-video");
  await sleep(400);
  check("selecting a video node opens the panel", (await evaluate("document.querySelectorAll('aside').length")) === 1, await panelText());
  check("the panel offers model and duration", Boolean(await evaluate(`Boolean(document.querySelector('${trigger("model")}')) && Boolean(document.querySelector('${trigger("duration")}'))`)));
  check("the prompt stayed on the card", (await evaluate("Boolean(document.querySelector('.react-flow__node-video textarea')) && !document.querySelector('aside textarea')")) === true);
  check("the card no longer carries the model select", (await evaluate("document.querySelectorAll('.react-flow__node-video select').length")) === 0);

  // Change the model through the panel; the card header must follow.
  const headerBefore = await evaluate("document.querySelector('.react-flow__node-video').innerText.split('\\n')[1]");
  await click(trigger("model"));
  await sleep(300);
  await clickOption("Gen-4.5");
  await sleep(400);
  const headerAfter = await evaluate("document.querySelector('.react-flow__node-video').innerText.split('\\n')[1]");
  check("picking a model updates the card header", headerBefore !== headerAfter && /Gen-4.5/.test(headerAfter), `${headerBefore} -> ${headerAfter}`);
  check("the store kept the model id, not the label", (await evaluate("JSON.parse(localStorage.getItem('flow-builder-state')).state.nodes[0].data.model")) === "runway:gen4.5");

  await click(trigger("duration"));
  await sleep(300);
  await clickOption("8s");
  await sleep(400);
  const duration = await evaluate("JSON.parse(localStorage.getItem('flow-builder-state')).state.nodes[0].data.duration");
  check("picking a duration writes a number, not a string", duration === 8, `${JSON.stringify(duration)} (${typeof duration})`);

  // The canvas stays live: click a second node and the panel follows it.
  await click(".react-flow__node-tts");
  await sleep(400);
  check("selecting another node moves the panel to it", (await panelText())?.startsWith("Text to Speech") === true, await panelText());
  check("the tts card gave up its voice select", (await evaluate("document.querySelectorAll('.react-flow__node-tts [data-slot=select-trigger]').length")) === 0);
  check("the tts header reads its model from the table", (await evaluate("document.querySelector('.react-flow__node-tts').innerText.includes('Eleven Multilingual v2')")) === true);

  await click(".react-flow__node-composition");
  await sleep(400);
  check("a kind with no settings says so", /Nothing to configure/i.test((await panelText()) ?? ""), await panelText());

  // Deselect by clicking empty canvas.
  await clickAt(760, 900);
  await sleep(400);
  check("the panel closes when the selection goes away", (await evaluate("document.querySelectorAll('aside').length")) === 0);

  // Non-modal: no focus guards, no overlay, and the toolbar still works with the panel open.
  await click(".react-flow__node-video");
  await sleep(400);
  check("no focus trap and no overlay", (await evaluate("document.querySelectorAll('[data-radix-focus-guard]').length === 0 && document.querySelectorAll('[data-slot=dialog-overlay]').length === 0")) === true);
  await click('button[title="Add Image"]');
  await sleep(500);
  check("the canvas stays usable with the panel open", (await evaluate("document.querySelectorAll('.react-flow__node').length")) === 4);

  await evaluate("document.querySelector('.react-flow__controls-fitview').click()");
  await sleep(900);
  writeFileSync(OUT, Buffer.from((await send("Page.captureScreenshot", { format: "png" })).data, "base64"));
  console.log("screenshot:", OUT);
} catch (e) { check("script completed", false, String(e.message ?? e)); } finally { try { ws?.close(); } catch {} chrome.kill(); }
const failed = results.filter(r => !r).length;
console.log(`\n${results.length - failed}/${results.length} checks passed`);
process.exit(failed ? 1 : 0);

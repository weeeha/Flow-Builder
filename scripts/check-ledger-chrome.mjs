// Usage: pnpm dev, then `node scripts/check-ledger-chrome.mjs` (env: APP_URL, CDP_PORT, OUT_DIR).
// Price Tag in stub mode: the tries control multiplies the toolbar estimate, Run all
// opens the run ledger with one row per paid job, a stub run says nothing was
// charged, and with the opt-in failure cookie a video job fails with its charge
// still on the row. Screenshots at 1440 and 375 for the unslop chrome pass.
import { STATE_JS, legacyFile, openFlowCdp } from "./lib/flow-session.mjs";
import { spawn } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const node = (id, type, x, y, data) => ({ id, type, position: { x, y }, data: { status: "idle", ...data } });
const SAVED = {
  nodes: [
    node("image-a", "image", 0, 0, { prompt: "a lighthouse at dusk", model: "flux-schnell" }),
    node("video-a", "video", 420, 0, { prompt: "slow push in", model: "runway:gen4.5", duration: 4 }),
    node("video-b", "video", 420, 380, { prompt: "slow push in", model: "runway:seedance2_5", duration: 4 }),
  ],
  edges: [],
};

const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const PORT = Number(process.env.CDP_PORT ?? 9341);
const APP = process.env.APP_URL ?? "http://localhost:3000";
const OUT_DIR = process.env.OUT_DIR ?? ".";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const results = [];
const check = (name, ok, detail = "") => {
  results.push({ ok });
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ": " + detail : ""}`);
};

const profile = mkdtempSync(join(tmpdir(), "flow-ledger-"));
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
const text = (sel) => evaluate(`document.querySelector(${JSON.stringify(sel)})?.textContent ?? null`);
// Visible buttons only: the toolbar readout is drawn twice, once per breakpoint.
const clickButton = (label) =>
  evaluate(`(() => { const b = [...document.querySelectorAll('button')].find(b => b.offsetParent && b.textContent.trim() === ${JSON.stringify(label)}); b?.click(); return Boolean(b); })()`);

async function runAllAndWait() {
  await clickButton("Run all");
  for (let i = 0; i < 60; i++) {
    await sleep(500);
    const statuses = await evaluate(`${STATE_JS}.nodes.map(n => n.data.status)`);
    if (statuses.every((s) => s === "done" || s === "error" || s === "idle") && !statuses.includes("running")) {
      const rows = await evaluate("document.querySelectorAll('[data-slot=ledger-row]').length");
      if (rows > 0) return;
    }
  }
}
const rows = () =>
  evaluate(`[...document.querySelectorAll('[data-slot=ledger-row]')].map(r => ({ status: r.dataset.status, charge: r.dataset.charge, text: r.textContent }))`);

async function shot(name, width, height) {
  await send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: width < 768 });
  await sleep(600);
  const s = await send("Page.captureScreenshot", { format: "png" });
  const path = join(OUT_DIR, name);
  writeFileSync(path, Buffer.from(s.data, "base64"));
  console.log("screenshot:", path);
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
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject, method } = pending.get(msg.id);
      pending.delete(msg.id);
      msg.error ? reject(new Error(`${method}: ${msg.error.message}`)) : resolve(msg.result);
    }
  });
  await new Promise((resolve, reject) => { ws.addEventListener("open", resolve); ws.addEventListener("error", reject); });
  await send("Page.enable");
  await send("Runtime.enable");
  await send("Network.enable");
  await send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  await openFlowCdp({ send, evaluate, sleep }, APP, legacyFile(SAVED.nodes, SAVED.edges));

  // Before a run: the ledger is closed and the header offers it.
  check("ledger is closed before any run", (await evaluate("document.querySelectorAll('[aria-labelledby=run-ledger-title]').length")) === 0);
  const pressed1 = await evaluate(`[...document.querySelectorAll('[aria-label="Tries per node"] button')].filter(b => b.offsetParent).map(b => b.getAttribute('aria-pressed'))`);
  check("tries control offers 1, 3 and 5 with 1 pressed", JSON.stringify(pressed1) === '["true","false","false"]', JSON.stringify(pressed1));
  await clickButton("3");
  await sleep(200);
  const pressed3 = await evaluate(`[...document.querySelectorAll('[aria-label="Tries per node"] button')].filter(b => b.offsetParent).map(b => b.getAttribute('aria-pressed'))`);
  check("pressing 3 selects 3 tries", JSON.stringify(pressed3) === '["false","true","false"]', JSON.stringify(pressed3));
  const estimate = await text("[data-slot=run-cost] [aria-live]");
  check("toolbar estimate is present", Boolean(estimate), estimate ?? "none");
  await shot("ledger-before-1440.png", 1440, 900);

  // A stub run: three jobs, nothing charged.
  await send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  await runAllAndWait();
  const stubRows = await rows();
  check("Run all writes one row per paid job", stubRows.length === 3, `${stubRows.length} rows`);
  check("every stub row is done and charged nothing", stubRows.every((r) => r.status === "done" && r.charge === "none"), JSON.stringify(stubRows.map((r) => [r.status, r.charge])));
  const summary = await evaluate("document.querySelector('[aria-labelledby=run-ledger-title]').textContent");
  check("summary says charged 0 and stub mode", /Charged 0 credits/.test(summary) && /Stub mode/.test(summary), summary.slice(0, 120));
  await shot("ledger-stub-1440.png", 1440, 900);
  await shot("ledger-stub-375.png", 375, 812);
  const fit = await evaluate(`(() => {
    const panel = document.querySelector('[aria-labelledby=run-ledger-title]').getBoundingClientRect();
    const sizes = [...document.querySelectorAll('[aria-labelledby=run-ledger-title] *')]
      .filter(e => [...e.childNodes].some(n => n.nodeType === 3 && n.textContent.trim()))
      .map(e => parseFloat(getComputedStyle(e).fontSize));
    return { left: panel.left, right: panel.right, width: innerWidth, minFont: Math.min(...sizes) };
  })()`);
  check("at 375 the ledger keeps a 16px gutter both sides", fit.width === 375 && fit.left >= 16 && fit.right <= fit.width - 16, JSON.stringify(fit));
  check("no ledger text under 12px", fit.minFont >= 12, `smallest ${fit.minFont}px`);

  // An opt-in stub failure: the video job fails, its row keeps a charge of its own.
  await send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  await send("Network.setCookie", { name: "flow-stub-fail", value: "1", url: APP });
  await runAllAndWait();
  const failRows = await rows();
  const failed = failRows.find((r) => r.status === "failed");
  check("a failed video job gets a failed row", Boolean(failed), JSON.stringify(failRows.map((r) => [r.status, r.charge])));
  check("the failed row states its charge as a separate word", Boolean(failed) && /Nothing charged/.test(failed.text) && /Failed/.test(failed.text), failed?.text ?? "");
  check("Run all stops at the failure", failRows.length === 2, `${failRows.length} rows`);
  await shot("ledger-failed-1440.png", 1440, 900);

  // Close and reopen from the header.
  await evaluate("document.querySelector('[aria-label=\"Close the run ledger\"]').click()");
  await sleep(200);
  const header = await evaluate("[...document.querySelectorAll('button')].find(b => b.textContent.startsWith('Ledger'))?.textContent ?? null");
  check("closed ledger leaves a header button with the job count", header === "Ledger (2)", header ?? "none");
  await clickButton("Ledger (2)");
  await sleep(200);
  check("the header button reopens it", (await evaluate("document.querySelectorAll('[data-slot=ledger-row]').length")) === 2);
} catch (err) {
  check("script completed", false, String(err.message ?? err));
} finally {
  try { ws?.close(); } catch {}
  chrome.kill();
}
const failedChecks = results.filter((r) => !r.ok);
console.log(`\n${results.length - failedChecks.length}/${results.length} checks passed`);
process.exit(failedChecks.length ? 1 : 0);

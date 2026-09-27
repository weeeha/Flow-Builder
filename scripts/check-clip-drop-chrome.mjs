// Usage: pnpm dev, then `node scripts/check-clip-drop-chrome.mjs`
// (env: APP_URL, CDP_PORT, OUT, CLIP, ANALYZE_TIMEOUT, ANALYZE_DELAY).
// Build 11's thin slice end to end: a video dropped on the canvas
// shows the overlay, samples 8 real frames for the analysis (keeping 3 on a
// reference node that counts them in and fills its strip as they land), logs
// the run, and the answer's
// graph lands beside it, wired, without moving what was already there; Run all
// then takes every node to done. Last, two clips land on one spot while the
// first is still reading, and its late answer grows it: nothing overlaps.
// CLIP defaults to a 6s test pattern with a tone,
// made with ffmpeg, so every sampled frame differs and the clip has audio.
//
// Runs against stub or live analysis: every wait is on a condition, up to
// ANALYZE_TIMEOUT ms (default 120000; a live model takes 17 to 29s), and the
// checks compare the cards with what the route answered. ANALYZE_DELAY holds
// each answer that many ms in the page, to act out a slow model in stub mode.
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
const ANALYZE_TIMEOUT = Number(process.env.ANALYZE_TIMEOUT ?? 120_000);
const ANALYZE_DELAY = Number(process.env.ANALYZE_DELAY ?? 0);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
/** Reads until `done(value)` holds or `ms` runs out, and returns the last value read. */
async function until(read, done, ms, every = 250) {
  const end = Date.now() + ms;
  let value = await read();
  while (!done(value) && Date.now() < end) {
    await sleep(every);
    value = await read();
  }
  return value;
}

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
  // Fixtures from every route, whatever keys the server holds (lib/stub.ts).
  await send("Network.setCookie", { name: "flow-stub", value: "1", url: new URL(APP).origin });
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

  // Record what the analysis is sent (the node keeps only 3 of the 8 frames)
  // and what it answers, held ANALYZE_DELAY ms first to act out a slow model.
  await evaluate(`(() => {
    const real = window.fetch;
    window.__answers = [];
    window.fetch = async (url, init) => {
      if (!String(url).includes("/api/analyze/clip")) return real(url, init);
      window.__sent = JSON.parse(init.body);
      const res = await real(url, init);
      window.__answers.push(await res.clone().json());
      await new Promise((r) => setTimeout(r, ${ANALYZE_DELAY}));
      return res;
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
  // Every status line and strip size the reference card shows, polled while it reads.
  await evaluate(`(() => {
    window.__card = [];
    window.__cardPoll = setInterval(() => {
      const card = document.querySelector(".react-flow__node-reference");
      if (!card) return;
      const entry = { line: card.querySelector("p[aria-live]")?.textContent ?? "", strip: card.querySelectorAll('img[alt^="Frame at"]').length };
      const last = window.__card.at(-1);
      if (!last || last.line !== entry.line || last.strip !== entry.strip) window.__card.push(entry);
    }, 20);
  })()`);
  await fire("dragover");
  await sleep(150);
  const overlay = await evaluate("[...document.querySelectorAll('span')].some(s => s.textContent === 'Drop to read the clip')");
  check("dragging a file shows the drop overlay", overlay);

  await fire("drop");
  await sleep(150);
  check("the overlay goes away on drop", !(await evaluate("[...document.querySelectorAll('span')].some(s => s.textContent === 'Drop to read the clip')")));

  const settled = (r) => r?.data.status === "done" || r?.data.status === "error";
  const ref = await until(async () => (await stored()).nodes.find((n) => n.type === "reference"), settled, ANALYZE_TIMEOUT);
  check("a reference node lands and finishes reading", ref?.data.status === "done", ref ? `${ref.data.status}${ref.data.error ? " · " + ref.data.error : ""}` : "none");
  const answer = (await evaluate("window.__answers"))[0] ?? { breakdown: {}, graph: { nodes: [], edges: [] } };
  const summary = answer.breakdown.summary;
  console.log(`INFO analysis: ${answer.stub ? "stub" : "live"}, ${answer.path}, "${summary}"`);

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
  check("it carries the answer's summary and path", Boolean(summary) && ref?.data.summary === summary && ref?.data.path === answer.path, `${ref?.data.summary} · ${ref?.data.path}`);

  const arrivals = (await evaluate("window.__arrivals")).filter((a) => a.type !== "reference");
  const gaps = arrivals.slice(1).map((a, i) => Math.round(a.at - arrivals[i].at));
  check("the graph lands one card at a time, about 150ms apart", arrivals.length === answer.graph.nodes.length && gaps.every((g) => g >= 110 && g < 400),
    `${arrivals.map((a) => a.type).join(" → ")} · gaps ${gaps.join(", ")}ms`);

  await evaluate("clearInterval(window.__cardPoll)");
  const card = await evaluate("window.__card");
  const lines = card.map((c) => c.line);
  check("the card counts frames while sampling", lines.some((l) => /^Sampling frames [1-7]\/8$/.test(l)), lines.filter((l) => l.startsWith("Sampling")).join(", "));
  const firstSummary = card.findIndex((c) => c.line === summary);
  check("the strip fills before the summary appears", firstSummary > 0 && card.slice(0, firstSummary).some((c) => c.strip > 0 && c.strip < 3), card.map((c) => `${c.strip}:${c.line || "-"}`).join(" | "));
  check("it ends with 3 frames, the summary and the path label", await evaluate(`(() => {
    const card = document.querySelector(".react-flow__node-reference");
    return card.querySelectorAll('img[alt^="Frame at"]').length === 3 && card.querySelector("p[aria-live]").textContent === ${JSON.stringify(summary)} && card.textContent.includes(${JSON.stringify(answer.path)});
  })()`));
  const log = await evaluate(`JSON.parse(localStorage.getItem("flow-builder-clip-log") ?? "[]")`);
  check("the run is logged with its path, stub or live", log.length === 1 && log[0].path === answer.path && log[0].stub === Boolean(answer.stub), JSON.stringify(log));

  const state = await stored();
  const kinds = state.nodes.map((n) => n.type).sort().join(",");
  const expectedKinds = ["image", "reference", ...answer.graph.nodes.map((n) => n.kind)].sort().join(",");
  check("the answer's graph lands beside it", kinds === expectedKinds, kinds);
  const edgeCount = answer.graph.edges.length;
  check(`its ${edgeCount} edges are stored`, edgeCount > 0 && state.edges.length === edgeCount, `${state.edges.length}`);
  const drawn = await until(() => evaluate("document.querySelectorAll('.react-flow__edge').length"), (n) => n === edgeCount, 2000, 100);
  check("and drawn", drawn === edgeCount, `${drawn}`);
  const before = state.nodes.find((n) => n.id === "image-a");
  check("the node that was already there did not move", before?.position.x === -600 && before?.position.y === 0 && before?.data.prompt === "already here");

  /** Every pair of cards drawn over each other, fitted to the view first. */
  const overlapping = async () => {
    await evaluate("document.querySelector('.react-flow__controls-fitview').click()");
    await sleep(600);
    return evaluate(`(() => {
      const boxes = [...document.querySelectorAll('.react-flow__node')].map(n => ({ id: n.dataset.id, r: n.getBoundingClientRect() }));
      const hit = [];
      for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i].r, b = boxes[j].r;
        if (a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom) hit.push(boxes[i].id + "/" + boxes[j].id);
      }
      return hit;
    })()`);
  };
  const overlaps = await overlapping();
  check("no two cards overlap", overlaps.length === 0, overlaps.join(", "));
  const storedKB = await evaluate(`Math.round(localStorage.getItem("flow-builder-state").length / 1024)`);
  console.log(`INFO persisted graph size with one clip: ${storedKB}KB`);

  // Reduced motion: a second clip's graph lands all at once.
  await send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });
  await evaluate("window.__arrivals = []");
  await fire("drop");
  const bothRead = (refs) => refs.length === 2 && refs.every(settled);
  await until(async () => (await stored()).nodes.filter((n) => n.type === "reference"), bothRead, ANALYZE_TIMEOUT);
  const secondAnswer = (await evaluate("window.__answers"))[1];
  const second = (await evaluate("window.__arrivals")).filter((a) => a.type !== "reference");
  const spread = second.length ? Math.round(second.at(-1).at - second[0].at) : -1;
  check("under reduced motion the second graph lands at once", second.length > 0 && second.length === secondAnswer?.graph.nodes.length && spread < 50, `${second.length} cards within ${spread}ms`);
  await send("Emulation.setEmulatedMedia", { features: [] });
  const overlaps2 = await overlapping();
  check("a second drop in the same spot still overlaps nothing", overlaps2.length === 0, overlaps2.join(", "));

  const found = await evaluate("(() => { const b = [...document.querySelectorAll('button')].find(b => b.textContent.trim() === 'Run all'); b?.click(); return Boolean(b); })()");
  let statuses = {};
  for (let i = 0; i < 60; i++) {
    await sleep(500);
    statuses = Object.fromEntries((await stored()).nodes.map((n) => [n.type + ":" + n.id.slice(0, 12), n.data.status]));
    if (Object.values(statuses).every((s) => s === "done" || s === "error")) break;
  }
  check("Run all takes every node to done in stub mode", found && Object.values(statuses).every((s) => s === "done"), JSON.stringify(statuses));

  // Both modes end with a reload. With BLOB_READ_WRITE_TOKEN set on the dev
  // server the clips upload while they are read, so they survive it; without,
  // they are session-only object URLs, and each card says so instead. Either
  // way the frames and summary read from the clip stay.
  let refs = [];
  for (let i = 0; i < 40; i++) {
    refs = (await stored()).nodes.filter((n) => n.type === "reference");
    if (refs.every((r) => r.data.clipUrl?.startsWith("https://"))) break;
    await sleep(500);
  }
  const uploaded = refs.length > 0 && refs.every((r) => r.data.clipUrl?.startsWith("https://"));
  console.log(`INFO uploads ${uploaded ? "on: " + refs.map((r) => r.data.clipUrl.replace(/^https:\/\/([^/]+).*$/, "$1")).join(", ") : "off"}`);
  if (uploaded) {
    check("each clip's stored URL is also what its video output hands on", refs.every((r) => r.data.outputUrl === r.data.clipUrl));
  }

  const reloaded = new Promise((resolve) => { onEvent = (m) => { if (m.method === "Page.loadEventFired") resolve(); }; });
  await send("Page.reload");
  await reloaded;
  for (let i = 0; i < 40; i++) {
    await sleep(250);
    if (await evaluate("document.querySelectorAll('[aria-label=\"Frames from the clip\"]').length === 2")) break;
  }
  await sleep(uploaded ? 3000 : 0);
  const afterReload = await evaluate(`[...document.querySelectorAll('.react-flow__node-reference')].map((card) => ({
    missing: card.querySelector('[data-slot=media-slot]')?.textContent.includes('Clip missing after reload. Drop it again.') ?? false,
    video: card.querySelector('video')?.src.slice(0, 8) ?? null,
    playable: (card.querySelector('video')?.readyState ?? 0) >= 1,
    duration: Math.round(card.querySelector('video')?.duration ?? 0),
    strip: card.querySelectorAll('[aria-label="Frames from the clip"] img').length,
    summary: ${JSON.stringify([summary, secondAnswer?.breakdown.summary])}.some((s) => s && card.textContent.includes(s)),
  }))`);
  if (uploaded) {
    check("after a reload each stored clip still plays", afterReload.length === 2 && afterReload.every((c) => !c.missing && c.video === "https://" && c.playable && c.duration === 6), JSON.stringify(afterReload));
  } else {
    check("after a reload each card says its clip is missing, with no dead player", afterReload.length === 2 && afterReload.every((c) => c.missing && !c.video), JSON.stringify(afterReload));
  }
  check("and keeps its 3 frames and the summary", afterReload.every((c) => c.strip === 3 && c.summary));

  // A slow model: a clip still reading when a second lands on the same spot,
  // below it. Both answers are held; then the first comes back as a gateway
  // timeout without reaching the route, which grows its card to the tallest a
  // card gets (error and skeleton offer), and the second's lands for real.
  const earlier = new Set((await stored()).nodes.map((n) => n.id));
  await evaluate(`(() => {
    const bytes = Uint8Array.from(atob(${JSON.stringify(CLIP_B64)}), (c) => c.charCodeAt(0));
    window.__clip = new File([bytes], "clip.mp4", { type: "video/mp4" });
    window.__gates = [];
    const real = window.fetch;
    window.fetch = async (url, init) => {
      if (!String(url).includes("/api/analyze/clip")) return real(url, init);
      const i = window.__gates.length;
      await new Promise((open) => window.__gates.push(open));
      return i === 0 ? new Response(JSON.stringify({ error: "Analysis failed: gateway timeout" }), { status: 502 }) : real(url, init);
    };
  })()`);
  const held = (n) => until(() => evaluate("window.__gates.length"), (count) => count === n, 30_000, 100);
  await fire("drop");
  await held(1);
  await fire("drop");
  await held(2);
  const newRefs = async () => (await stored()).nodes.filter((n) => n.type === "reference" && !earlier.has(n.id));
  const reading = await newRefs();
  check("two clips on one spot, both still reading", reading.length === 2 && reading.every((r) => r.data.status === "running"), reading.map((r) => r.data.status).join(", "));
  await evaluate("window.__gates[0]()");
  await evaluate("window.__gates[1]()");
  const [slow, next] = await until(newRefs, bothRead, ANALYZE_TIMEOUT);
  check("the first answer grows its card with the error and the skeleton offer", slow?.data.status === "error" && slow.data.offerSkeleton === true, `${slow?.data.status} · ${slow?.data.error}`);
  check("the second lands its graph", next?.data.status === "done", `${next?.data.status}${next?.data.error ? " · " + next.data.error : ""}`);
  const heights = await evaluate(`${JSON.stringify([slow?.id, next?.id])}.map((id) => document.querySelector('[data-id="' + id + '"]')?.offsetHeight)`);
  console.log(`INFO heights of the two cards once answered: ${heights.join(", ")}px`);
  const overlaps3 = await overlapping();
  check("a card that grew after a second was placed below it overlaps nothing", overlaps3.length === 0, overlaps3.join(", "));

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

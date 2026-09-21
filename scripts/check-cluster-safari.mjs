// Usage: pnpm dev, Safari > Settings > Developer > Allow remote automation on,
// `safaridriver -p 4445 &` then `node scripts/check-cluster-safari.mjs` (env: APP_URL, SD_PORT, OUT).
// Drives a visible Safari window through safaridriver and runs build 07's
// task-11 checks: chips render, Tab reaches a chip with a visible focus ring,
// Enter and Space toggle a pin, a pin adds a handle, "to video" lands a wired
// node, a second pin's handle connects by a real drag, one group re-rolls alone.
import { writeFileSync } from "node:fs";

const BASE = `http://localhost:${process.env.SD_PORT ?? 4445}`;
const APP = process.env.APP_URL ?? "http://localhost:3000";
const OUT = process.env.OUT ?? "./safari.png";
const ELEMENT = "element-6066-11e4-a52e-4f735466cecf";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? " · " + detail : ""}`);
};

const { sessionId: sid } = await wd("POST", "/session", {
  capabilities: { alwaysMatch: { browserName: "Safari" } },
});
const S = (p) => `/session/${sid}${p}`;
const exec = (script, args = []) => wd("POST", S("/execute/sync"), { script, args });
const find = async (using, value) => (await wd("POST", S("/element"), { using, value }))[ELEMENT];
const click = (el) => wd("POST", S(`/element/${el}/click`), {});
const keys = (text) =>
  wd("POST", S("/actions"), {
    actions: [
      {
        type: "key",
        id: "kb",
        actions: [...text].flatMap((c) => [{ type: "keyDown", value: c }, { type: "keyUp", value: c }]),
      },
    ],
  });
const groupTexts = () =>
  exec(
    "return [...document.querySelectorAll('[role=group][aria-label$=\" suggestions\"]')].map(g => [g.getAttribute('aria-label'), [...g.querySelectorAll('button[aria-pressed]')].map(b => b.textContent.trim())])"
  );
const count = (sel) => exec("return document.querySelectorAll(arguments[0]).length", [sel]);

try {
  await wd("POST", S("/window/rect"), { x: 0, y: 0, width: 1440, height: 900 });
  await wd("POST", S("/url"), { url: APP });
  await exec("localStorage.clear(); location.reload();");
  await sleep(3000);

  await click(await find("css selector", 'button[title="Add Concept Cluster"]'));
  const textarea = await find("css selector", 'textarea[aria-label="Seed prompt"]');
  await click(textarea);
  await wd("POST", S(`/element/${textarea}/value`), { text: "a lighthouse at dusk" });
  await click(await find("xpath", "//button[normalize-space(.)='Run']"));

  let chips = 0;
  for (let i = 0; i < 25 && chips === 0; i++) {
    await sleep(300);
    chips = await count("button[aria-pressed]");
  }
  check("fixture chips render after Run", chips === 12, `${chips} chips`);

  // Keyboard: from the textarea, Tab until a chip has focus.
  await click(textarea);
  let focused = null;
  for (let i = 0; i < 8 && !focused; i++) {
    await keys("");
    focused = await exec(
      "const a = document.activeElement; return a && a.hasAttribute('aria-pressed') ? a.textContent.trim().slice(0, 40) : null"
    );
  }
  check("Tab reaches a chip", Boolean(focused), focused ?? "");
  check("focused chip matches :focus-visible", (await exec("return document.activeElement.matches(':focus-visible')")) === true);
  await keys("");
  check("Enter pins the chip", (await exec("return document.activeElement.getAttribute('aria-pressed')")) === "true");
  await keys(" ");
  check("Space unpins it", (await exec("return document.activeElement.getAttribute('aria-pressed')")) === "false");
  await keys("");
  check("Enter pins it again", (await exec("return document.activeElement.getAttribute('aria-pressed')")) === "true");
  check("a pin adds a text source handle", (await count('.react-flow__handle.source[data-handleid*=":text:"]')) === 1);

  // Branch action: to video.
  await click(await find("css selector", 'button[aria-label$="to video node"]'));
  await sleep(500);
  check("to video adds a video node", (await count(".react-flow__node-video")) === 1);
  check("to video wires it", (await count(".react-flow__edge")) === 1);

  // Second pin, then a real drag from its handle to the video node's text input.
  await click(await find("xpath", "(//button[@aria-pressed])[2]"));
  await sleep(300);
  const pinHandles = await exec(
    "return [...document.querySelectorAll('.react-flow__handle.source[data-handleid*=\":text:\"]')].map(h => h.dataset.handleid)"
  );
  check("second pin adds a second handle", pinHandles.length === 2, pinHandles.join(", "));
  // Zoom out until the video node's text handle is on screen.
  for (let i = 0; i < 6; i++) {
    const inView = await exec(
      "const h = document.querySelector('.react-flow__node-video .react-flow__handle.target[data-handleid$=\":text\"]'); if (!h) return false; const r = h.getBoundingClientRect(); return r.left > 0 && r.right < innerWidth && r.top > 0 && r.bottom < innerHeight"
    );
    if (inView) break;
    await click(await find("css selector", ".react-flow__controls-zoomout"));
    await sleep(200);
  }
  const src = await find("css selector", `.react-flow__handle.source[data-handleid="${pinHandles[1]}"]`);
  const dst = await find("css selector", '.react-flow__node-video .react-flow__handle.target[data-handleid$=":text"]');
  await wd("POST", S("/actions"), {
    actions: [
      {
        type: "pointer",
        id: "mouse",
        parameters: { pointerType: "mouse" },
        actions: [
          { type: "pointerMove", duration: 0, origin: { [ELEMENT]: src }, x: 0, y: 0 },
          { type: "pointerDown", button: 0 },
          { type: "pointerMove", duration: 300, origin: { [ELEMENT]: dst }, x: 2, y: 2 },
          { type: "pointerMove", duration: 200, origin: { [ELEMENT]: dst }, x: 0, y: 0 },
          { type: "pointerUp", button: 0 },
        ],
      },
    ],
  });
  await sleep(300);
  check("a pinned handle connects by drag", (await count(".react-flow__edge")) === 2, `${await count(".react-flow__edge")} edges`);

  // Re-roll one group.
  const before = await groupTexts();
  await click(await find("css selector", 'button[aria-label="Re-roll era"]'));
  await sleep(1500);
  const after = await groupTexts();
  const same = (i) => JSON.stringify(before[i]) === JSON.stringify(after[i]);
  check("re-roll era changes only era", !same(1) && same(0) && same(2) && same(3));
  check("the two pins survive the re-roll", (await count('button[aria-pressed="true"]')) === 2);

  const png = await wd("GET", S("/screenshot"));
  writeFileSync(OUT, Buffer.from(png, "base64"));
  console.log("screenshot:", OUT);
} catch (err) {
  check("script completed", false, String(err.message ?? err));
} finally {
  await wd("DELETE", S(""), undefined).catch(() => {});
}
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);

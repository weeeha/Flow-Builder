// scripts/lib/flow-session.mjs
// Browser-side snippets the check scripts evaluate. Since flow documents, the
// canvas lives at /flows/<id> and state lives in IndexedDB, so a script resets
// storage, imports its flow through window.__flowBuilder, and opens it.

/** Clear flows and localStorage. Needs a page that installed the hook (/ or /flows/new). */
export const RESET_JS = `window.__flowBuilder.reset()`;

/** Import a flow (any shape `migrate` accepts) and resolve to its id. */
export const importJs = (file) => `window.__flowBuilder.importFlow(${JSON.stringify(file)})`;

/** Read something from the open flow, e.g. stateJs("s.nodes.length"). */
export const stateJs = (expr) => `((s) => ${expr})(window.__flowBuilder.state())`;

/** The legacy localStorage shape, which `migrate` lifts, for flows typed out by hand. */
export const legacyFile = (nodes, edges = []) => ({ state: { nodes, edges }, version: 0 });

/** The open flow as the store holds it: { flowId, name, nodes, edges }. */
export const STATE_JS = "window.__flowBuilder.state()";

/** A path on the app, keeping APP_URL's query (a Vercel share token) on every URL. */
export const appUrl = (base, path) => {
  const url = new URL(path, base);
  url.search = new URL(base).search;
  return url.toString();
};

/**
 * Chrome (CDP): start from empty storage, add `file` (or a blank flow), open it,
 * and resolve once the canvas is up. `evaluate` must await promises. Evaluations
 * that land mid-navigation throw; polling treats that as not ready yet.
 */
export async function openFlowCdp({ send, evaluate, sleep }, base, file = null) {
  const until = async (expr, what, tries = 120) => {
    for (let i = 0; i < tries; i++) {
      await sleep(250);
      try { if (await evaluate(expr)) return; } catch {}
    }
    throw new Error(`timed out waiting for ${what}`);
  };
  const onFlow = `Boolean(window.__flowBuilder) && /^\\/flows\\/(?!new$)[^/]+$/.test(location.pathname)`;
  await send("Page.navigate", { url: appUrl(base, "/flows/new") });
  await until(onFlow, "a first flow");
  await evaluate(RESET_JS);
  let id;
  if (file) {
    id = await evaluate(importJs(file));
  } else {
    await send("Page.navigate", { url: appUrl(base, "/flows/new") });
    await until(onFlow, "a blank flow");
    id = await evaluate("location.pathname.split('/').pop()");
  }
  await send("Page.navigate", { url: appUrl(base, `/flows/${id}`) });
  await until(`Boolean(document.querySelector('.react-flow__controls')) && window.__flowBuilder?.state().flowId === ${JSON.stringify(id)}`, "the canvas");
  return id;
}

/** Safari (WebDriver): the same steps through `exec` (execute/async) and `navigate`. */
export async function openFlowWd({ exec, execAsync, navigate, sleep }, base, file = null) {
  const until = async (expr, what, tries = 120) => {
    for (let i = 0; i < tries; i++) {
      await sleep(250);
      try { if (await exec(`return ${expr}`)) return; } catch {}
    }
    throw new Error(`timed out waiting for ${what}`);
  };
  const onFlow = `Boolean(window.__flowBuilder) && /^\\/flows\\/(?!new$)[^/]+$/.test(location.pathname)`;
  await navigate(appUrl(base, "/flows/new"));
  await until(onFlow, "a first flow");
  await execAsync(RESET_JS);
  let id;
  if (file) {
    id = await execAsync(importJs(file));
  } else {
    await navigate(appUrl(base, "/flows/new"));
    await until(onFlow, "a blank flow");
    id = await exec("return location.pathname.split('/').pop()");
  }
  await navigate(appUrl(base, `/flows/${id}`));
  await until(`Boolean(document.querySelector('.react-flow__controls')) && window.__flowBuilder?.state().flowId === ${JSON.stringify(id)}`, "the canvas");
  return id;
}

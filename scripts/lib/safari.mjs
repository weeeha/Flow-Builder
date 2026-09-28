// A Safari WebDriver session that quits its own Safari when the script ends.
// safaridriver launches a fresh `Safari --automation` process for each session,
// and ending the session closes the window but leaves that process running, so
// every check run used to leave one more Safari in the Dock.
import { execFileSync } from "node:child_process";
import { constants } from "node:os";

const automationPids = () => {
  try {
    return execFileSync("pgrep", ["-f", "Safari.app/Contents/MacOS/Safari .*--automation"], { encoding: "utf8" })
      .split("\n")
      .filter(Boolean)
      .map(Number);
  } catch {
    return []; // pgrep exits 1 when nothing matches
  }
};

/**
 * Opens a Safari session through `wd(method, path, body)`. Returns its id and
 * `end()`, which deletes the session and quits the Safari it launched. The
 * Safari is also quit on exit, a thrown error, Ctrl-C or a kill, so a run cut
 * short by a timeout doesn't leak it either (SIGKILL is the one exception).
 */
export async function startSafari(wd) {
  const before = new Set(automationPids());
  const { sessionId } = await wd("POST", "/session", { capabilities: { alwaysMatch: { browserName: "Safari" } } });
  const launched = automationPids().filter((pid) => !before.has(pid));
  // Quit only a Safari we can pin to this session. Two new ones means another
  // run started alongside this one, and killing the wrong one would break it.
  let pid = launched.length === 1 ? launched[0] : null;
  if (!pid) console.log(`INFO couldn't pin this session's Safari (${launched.length} new); it stays open`);

  const quit = () => {
    if (!pid) return;
    try {
      process.kill(pid);
    } catch {} // already gone
    pid = null;
  };
  process.once("exit", quit);
  for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"]) {
    process.once(signal, () => process.exit(128 + constants.signals[signal]));
  }

  return {
    sessionId,
    end: async () => {
      await wd("DELETE", `/session/${sessionId}`).catch(() => {});
      quit();
    },
  };
}

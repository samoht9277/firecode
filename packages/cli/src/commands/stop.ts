import { readFile, rm } from "node:fs/promises";

function getStatePath(): string {
  const name = process.env.FIRECODE_INSTANCE || "default";
  const filename = name === "default" ? "server.json" : `server-${name}.json`;
  return `${process.env.HOME}/.firecode/${filename}`;
}

export async function stopCommand(): Promise<void> {
  const statePath = getStatePath();
  let raw: string;
  try {
    raw = await readFile(statePath, "utf-8");
  } catch {
    console.log("Firecode server is not running.");
    return;
  }

  const state = JSON.parse(raw);

  try {
    const res = await fetch(`http://127.0.0.1:${state.httpPort}/shutdown`, {
      method: "POST",
      headers: { Authorization: `Bearer ${state.authToken}` },
      signal: AbortSignal.timeout(2000),
    });
    if (res.ok) {
      console.log("Firecode server stopped.");
      return;
    }
  } catch {}

  // Force kill if unresponsive
  try {
    process.kill(state.pid, "SIGKILL");
    console.log(`Force killed firecode server (PID ${state.pid}).`);
  } catch {}

  await rm(statePath).catch(() => {});
  console.log("Cleaned up state file.");
}

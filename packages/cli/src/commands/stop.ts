import { readFile, rm } from "node:fs/promises";

const SERVER_STATE_PATH = `${process.env.HOME}/.firecode/server.json`;

export async function stopCommand(): Promise<void> {
  let raw: string;
  try {
    raw = await readFile(SERVER_STATE_PATH, "utf-8");
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

  await rm(SERVER_STATE_PATH).catch(() => {});
  console.log("Cleaned up state file.");
}

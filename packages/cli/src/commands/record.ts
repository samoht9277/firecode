import { FirecodeClient } from "../client.js";

export async function recordStartCommand(pageName: string): Promise<void> {
  try {
    const client = await FirecodeClient.connect();
    await client.post(`/pages/${pageName}/record/start`);
    console.log("Recording started. Interact with the page, then run: firecode record <page> stop");
  } catch (err: any) {
    console.error(`Error: ${err.message}`);
    process.exit(1);
  }
}

export async function recordStopCommand(pageName: string): Promise<void> {
  try {
    const client = await FirecodeClient.connect();
    const result = await client.post(`/pages/${pageName}/record/stop`);
    console.log(`Recording stopped. ${result.steps} steps captured.`);
    for (const step of result.recording) {
      console.log(`  ${step.action} ${step.args.join(" ")}`);
    }
  } catch (err: any) {
    console.error(`Error: ${err.message}`);
    process.exit(1);
  }
}

export async function recordSaveCommand(
  pageName: string,
  path: string,
): Promise<void> {
  try {
    const client = await FirecodeClient.connect();
    const result = await client.post(`/pages/${pageName}/record/save`, { path });
    console.log(`Saved ${result.steps} steps to ${result.path}`);
  } catch (err: any) {
    console.error(`Error: ${err.message}`);
    process.exit(1);
  }
}

export async function replayCommand(
  pageName: string,
  path: string,
): Promise<void> {
  try {
    const client = await FirecodeClient.connect();
    const result = await client.post(`/pages/${pageName}/replay`, { path });
    console.log(`Replayed ${result.steps} steps:`);
    for (const msg of result.results) {
      console.log(`  ${msg}`);
    }
  } catch (err: any) {
    console.error(`Error: ${err.message}`);
    process.exit(1);
  }
}

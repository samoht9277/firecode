import { FirecodeClient } from "../client.js";

export async function consoleCommand(
  pageName: string,
  options: { clear?: boolean }
): Promise<void> {
  try {
    const client = await FirecodeClient.connect();
    const clear = options.clear ? "true" : "false";
    const result = await client.get(
      `/pages/${pageName}/console?clear=${clear}`
    );

    if (result.logs.length === 0) {
      console.log("No console messages.");
      return;
    }

    for (const entry of result.logs) {
      const type = entry.type.toUpperCase().padEnd(7);
      console.log(`[${type}] ${entry.text}`);
    }
  } catch (err: any) {
    console.error(`Error: ${err.message}`);
    process.exit(1);
  }
}

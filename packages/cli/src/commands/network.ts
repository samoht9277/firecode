import { FirecodeClient } from "../client.js";

export async function networkCommand(
  pageName: string,
  options: { all?: boolean; clear?: boolean }
): Promise<void> {
  try {
    const client = await FirecodeClient.connect();
    const all = options.all ? "true" : "false";
    const clear = options.clear ? "true" : "false";
    const result = await client.get(
      `/pages/${pageName}/network?all=${all}&clear=${clear}`
    );

    if (result.logs.length === 0) {
      console.log(options.all ? "No network requests." : "No failed requests.");
      return;
    }

    for (const entry of result.logs) {
      console.log(`[${entry.status}] ${entry.method} ${entry.url}`);
    }
  } catch (err: any) {
    console.error(`Error: ${err.message}`);
    process.exit(1);
  }
}

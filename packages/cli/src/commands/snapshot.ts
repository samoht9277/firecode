import { FirecodeClient } from "../client.js";

export async function snapshotCommand(
  pageName: string,
  options?: { interactive?: boolean },
): Promise<void> {
  try {
    const client = await FirecodeClient.connect();
    const interactive = options?.interactive ? "true" : "false";
    const result = await client.get(
      `/pages/${pageName}/snapshot?interactive=${interactive}`,
    );
    console.log(result.snapshot);
  } catch (err: any) {
    console.error(`Error: ${err.message}`);
    process.exit(1);
  }
}

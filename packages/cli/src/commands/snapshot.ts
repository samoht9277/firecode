import { FirecodeClient } from "../client.js";

export async function snapshotCommand(pageName: string): Promise<void> {
  try {
    const client = await FirecodeClient.connect();
    const result = await client.get(`/pages/${pageName}/snapshot`);
    console.log(result.snapshot);
  } catch (err: any) {
    console.error(`Error: ${err.message}`);
    process.exit(1);
  }
}

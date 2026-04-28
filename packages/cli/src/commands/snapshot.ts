import { FirecodeClient } from "../client.js";

export async function snapshotCommand(
  pageName: string,
  options?: { interactive?: boolean; frame?: string },
): Promise<void> {
  try {
    const client = await FirecodeClient.connect();
    const params = new URLSearchParams();
    if (options?.interactive) params.set("interactive", "true");
    if (options?.frame) params.set("frame", options.frame);
    const qs = params.toString() ? `?${params.toString()}` : "";
    const result = await client.get(`/pages/${pageName}/snapshot${qs}`);
    console.log(result.snapshot);
  } catch (err: any) {
    console.error(`Error: ${err.message}`);
    process.exit(1);
  }
}

import { FirecodeClient } from "../client.js";

export async function screenshotCommand(
  pageName: string,
  path?: string,
  options?: { diff?: string }
): Promise<void> {
  try {
    const client = await FirecodeClient.connect();
    const body: any = {};
    if (path) body.path = path;
    if (options?.diff) body.diff = options.diff;

    const result = await client.post(`/pages/${pageName}/screenshot`, body);

    if (result.diff) {
      console.log(result.diff.message);
      console.log(`Screenshot: ${result.path}`);
    } else {
      console.log(result.path);
    }
  } catch (err: any) {
    console.error(`Error: ${err.message}`);
    process.exit(1);
  }
}

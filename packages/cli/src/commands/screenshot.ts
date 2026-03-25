import { FirecodeClient } from "../client.js";

export async function screenshotCommand(
  pageName: string,
  path?: string
): Promise<void> {
  try {
    const client = await FirecodeClient.connect();
    const result = await client.post(`/pages/${pageName}/screenshot`, {
      path,
    });
    console.log(result.path);
  } catch (err: any) {
    console.error(`Error: ${err.message}`);
    process.exit(1);
  }
}

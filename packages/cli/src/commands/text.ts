import { FirecodeClient } from "../client.js";

export async function textCommand(pageName: string): Promise<void> {
  try {
    const client = await FirecodeClient.connect();
    const result = await client.get(`/pages/${pageName}/text`);
    console.log(result.text);
  } catch (err: any) {
    console.error(`Error: ${err.message}`);
    process.exit(1);
  }
}

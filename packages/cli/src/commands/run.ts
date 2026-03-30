import { FirecodeClient } from "../client.js";

export async function runCommand(
  pageName: string,
  commands: string,
  options: { strict?: boolean },
): Promise<void> {
  try {
    const client = await FirecodeClient.connect();
    const result = await client.post(`/pages/${pageName}/run`, {
      commands,
      soft: !options.strict,
    });

    for (const msg of result.results) {
      console.log(msg);
    }
  } catch (err: any) {
    console.error(`Error: ${err.message}`);
    process.exit(1);
  }
}

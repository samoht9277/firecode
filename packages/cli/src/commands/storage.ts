import { FirecodeClient } from "../client.js";

export async function storageCommand(
  pageName: string,
  options: { session?: boolean; clear?: boolean },
): Promise<void> {
  try {
    const client = await FirecodeClient.connect();

    if (options.clear) {
      const type = options.session ? "session" : "all";
      const result = await client.post(`/pages/${pageName}/storage/clear`, { type });
      console.log(result.message);
      return;
    }

    const type = options.session ? "session" : "local";
    const result = await client.get(
      `/pages/${pageName}/storage?type=${type}`,
    );

    const entries = Object.entries(result.data);
    if (entries.length === 0) {
      console.log(`No ${type}Storage entries.`);
      return;
    }

    console.log(`${type}Storage:`);
    for (const [key, value] of entries) {
      console.log(`  ${key}: ${value}`);
    }
  } catch (err: any) {
    console.error(`Error: ${err.message}`);
    process.exit(1);
  }
}

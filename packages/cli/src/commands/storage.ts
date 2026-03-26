import { FirecodeClient } from "../client.js";

export async function storageCommand(
  pageName: string,
  options: { session?: boolean },
): Promise<void> {
  try {
    const client = await FirecodeClient.connect();
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

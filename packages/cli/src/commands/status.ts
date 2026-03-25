import { FirecodeClient } from "../client.js";

export async function statusCommand(): Promise<void> {
  try {
    const client = await FirecodeClient.connect();
    const status = await client.get("/status");
    console.log(`Server: running`);
    console.log(`Pages: ${status.pages}`);
    if (status.pageList?.length > 0) {
      for (const page of status.pageList) {
        console.log(`  ${page.name}: ${page.url} — "${page.title}"`);
      }
    }
  } catch (err: any) {
    console.error(err.message);
    process.exit(1);
  }
}

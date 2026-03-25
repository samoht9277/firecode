import { FirecodeClient } from "../client.js";

export async function stopCommand(): Promise<void> {
  try {
    const client = await FirecodeClient.connect();
    await client.post("/shutdown");
    console.log("Firecode server stopped.");
  } catch (err: any) {
    console.error(err.message);
    process.exit(1);
  }
}

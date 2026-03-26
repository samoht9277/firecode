import { FirecodeClient } from "../client.js";

export async function cookiesCommand(
  pageName: string,
): Promise<void> {
  try {
    const client = await FirecodeClient.connect();
    const result = await client.get(`/pages/${pageName}/cookies`);

    if (result.cookies.length === 0) {
      console.log("No cookies.");
      return;
    }

    for (const cookie of result.cookies) {
      console.log(`${cookie.name}=${cookie.value} (${cookie.domain}, ${cookie.path})`);
    }
  } catch (err: any) {
    console.error(`Error: ${err.message}`);
    process.exit(1);
  }
}

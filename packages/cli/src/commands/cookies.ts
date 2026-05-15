import { FirecodeClient } from "../client.js";

export async function cookiesCommand(pageName: string): Promise<void> {
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

export interface CookieSetOptions {
  domain: string;
  path?: string;
  expires?: string;
  httpOnly?: boolean;
  secure?: boolean;
  sameSite?: string;
}

export async function cookiesSetCommand(
  pageName: string,
  name: string,
  value: string,
  options: CookieSetOptions,
): Promise<void> {
  try {
    const client = await FirecodeClient.connect();
    await client.post("/pages", { name: pageName });

    const sameSite = options.sameSite ?? "Lax";
    if (!["Strict", "Lax", "None"].includes(sameSite)) {
      throw new Error(`Invalid sameSite "${sameSite}". Use Strict, Lax, or None.`);
    }

    const cookie = {
      name,
      value,
      domain: options.domain,
      path: options.path ?? "/",
      expires: options.expires ? parseInt(options.expires, 10) : -1,
      httpOnly: !!options.httpOnly,
      secure: !!options.secure,
      sameSite,
    };

    const result = await client.post(`/pages/${pageName}/cookies`, {
      cookies: [cookie],
    });
    console.log(result.message);
  } catch (err: any) {
    console.error(`Error: ${err.message}`);
    process.exit(1);
  }
}

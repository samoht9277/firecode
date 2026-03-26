import { FirecodeClient } from "../client.js";

export async function pdfCommand(
  pageName: string,
  path?: string,
): Promise<void> {
  try {
    const client = await FirecodeClient.connect();
    const body: any = {};
    if (path) body.path = path;

    const result = await client.post(`/pages/${pageName}/pdf`, body);
    console.log(result.path);
  } catch (err: any) {
    console.error(`Error: ${err.message}`);
    process.exit(1);
  }
}

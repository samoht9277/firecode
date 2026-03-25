import { FirecodeClient } from "../client.js";

const VALID_ACTIONS = [
  "navigate", "click", "fill", "select", "type", "wait", "hover",
] as const;

export async function browseCommand(
  pageName: string,
  action: string,
  args: string[]
): Promise<void> {
  if (!VALID_ACTIONS.includes(action as any)) {
    console.error(
      `Unknown action "${action}". Valid actions: ${VALID_ACTIONS.join(", ")}`
    );
    process.exit(1);
  }

  try {
    const client = await FirecodeClient.connect();

    // Navigate creates the page implicitly
    if (action === "navigate") {
      await client.post("/pages", { name: pageName });
    }

    const result = await client.post(`/pages/${pageName}/action`, {
      action,
      args,
    });

    console.log(result.message);
  } catch (err: any) {
    console.error(`Error: ${err.message}`);
    process.exit(1);
  }
}

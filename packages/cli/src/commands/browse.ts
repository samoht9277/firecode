import { FirecodeClient } from "../client.js";

const VALID_ACTIONS = [
  "navigate", "click", "fill", "select", "type", "wait", "hover",
  "evaluate", "scroll", "wait-for", "reload", "back", "forward",
  "keyboard", "viewport", "click-text", "assert-text", "wait-idle",
] as const;

export async function browseCommand(
  pageName: string,
  action: string,
  args: string[],
  options: { force?: boolean }
): Promise<void> {
  if (!VALID_ACTIONS.includes(action as any)) {
    console.error(
      `Unknown action "${action}". Valid actions: ${VALID_ACTIONS.join(", ")}`
    );
    process.exit(1);
  }

  try {
    const client = await FirecodeClient.connect();

    if (action === "navigate") {
      await client.post("/pages", { name: pageName });
    }

    const fullArgs = options.force ? [...args, "--force"] : args;

    const result = await client.post(`/pages/${pageName}/action`, {
      action,
      args: fullArgs,
    });

    console.log(result.message);
  } catch (err: any) {
    console.error(`Error: ${err.message}`);
    process.exit(1);
  }
}

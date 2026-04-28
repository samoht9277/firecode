import { FirecodeClient } from "../client.js";

const VALID_ACTIONS = [
  "navigate", "click", "fill", "select", "type", "wait", "hover",
  "evaluate", "scroll", "wait-for", "reload", "back", "forward",
  "keyboard", "viewport", "click-text", "assert-text", "wait-idle", "find-text",
] as const;

export async function browseCommand(
  pageName: string,
  action: string,
  args: string[],
  options: { force?: boolean; soft?: boolean; frame?: string; waitIdle?: boolean }
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

    const fullArgs = [...args];
    if (options.force) fullArgs.push("--force");
    if (options.soft) fullArgs.push("--soft");
    if (options.waitIdle) fullArgs.push("--wait-idle");
    if (options.frame) {
      fullArgs.push("--frame", options.frame);
    }

    const result = await client.post(`/pages/${pageName}/action`, {
      action,
      args: fullArgs,
    });

    if (action === "evaluate" && "result" in result) {
      const r = result.result;
      if (r === undefined) {
        console.log("undefined");
      } else if (typeof r === "string") {
        console.log(r);
      } else {
        console.log(JSON.stringify(r, null, 2));
      }
    } else {
      console.log(result.message);
    }
  } catch (err: any) {
    console.error(`Error: ${err.message}`);
    process.exit(1);
  }
}

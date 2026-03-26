import { Command } from "commander";
import { startCommand } from "./commands/start.js";
import { stopCommand } from "./commands/stop.js";
import { statusCommand } from "./commands/status.js";
import { browseCommand } from "./commands/browse.js";
import { snapshotCommand } from "./commands/snapshot.js";
import { screenshotCommand } from "./commands/screenshot.js";
import { textCommand } from "./commands/text.js";
import { consoleCommand } from "./commands/console.js";
import { networkCommand } from "./commands/network.js";

const program = new Command();

program
  .name("firecode")
  .description("Firefox browser automation for AI agents")
  .version("0.1.0");

program
  .command("start")
  .description("Launch Firefox and start the firecode server")
  .option("--headless", "Run Firefox in headless mode", false)
  .option("--headed", "Run Firefox in headed mode (default)")
  .option("-p, --port <port>", "HTTP API port (0 = auto)", parseInt)
  .action(async (options) => {
    await startCommand({
      headless: options.headless && !options.headed,
      port: options.port,
    });
  });

program
  .command("stop")
  .description("Stop the firecode server")
  .action(stopCommand);

program
  .command("status")
  .description("Show server status and open pages")
  .action(statusCommand);

program
  .command("browse")
  .description("Interact with a named page")
  .argument("<page>", "Page name")
  .argument(
    "<action>",
    "Action: navigate, click, fill, select, type, wait, hover, evaluate, scroll, wait-for, reload, back, forward",
  )
  .argument("[args...]", "Action arguments")
  .option("--force", "Force action past overlays")
  .action((page, action, args, options) => {
    browseCommand(page, action, args, options);
  });

program
  .command("snapshot")
  .description("Get AI-friendly ARIA snapshot of a page")
  .argument("<page>", "Page name")
  .action(snapshotCommand);

program
  .command("screenshot")
  .description("Capture a screenshot of a page")
  .argument("<page>", "Page name")
  .argument("[path]", "Output file path")
  .option("--diff <baseline>", "Compare against baseline screenshot")
  .action((page, path, options) => {
    screenshotCommand(page, path, options);
  });

program
  .command("text")
  .description("Get visible text content of a page")
  .argument("<page>", "Page name")
  .action(textCommand);

program
  .command("console")
  .description("Show browser console logs for a page")
  .argument("<page>", "Page name")
  .option("--clear", "Clear logs after displaying")
  .action((page, options) => {
    consoleCommand(page, options);
  });

program
  .command("network")
  .description("Show network requests for a page")
  .argument("<page>", "Page name")
  .option("--all", "Show all requests, not just failures")
  .option("--clear", "Clear logs after displaying")
  .action((page, options) => {
    networkCommand(page, options);
  });

program.parse();

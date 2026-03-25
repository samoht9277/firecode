import { Command } from "commander";
import { startCommand } from "./commands/start.js";
import { stopCommand } from "./commands/stop.js";
import { statusCommand } from "./commands/status.js";
import { browseCommand } from "./commands/browse.js";
import { snapshotCommand } from "./commands/snapshot.js";
import { screenshotCommand } from "./commands/screenshot.js";

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
  .argument("<action>", "Action: navigate, click, fill, select, type, wait, hover")
  .argument("[args...]", "Action arguments")
  .action(browseCommand);

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
  .action(screenshotCommand);

program.parse();

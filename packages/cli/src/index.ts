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
import { testCommand } from "./commands/test.js";
import { cookiesCommand, cookiesSetCommand } from "./commands/cookies.js";
import { storageCommand } from "./commands/storage.js";
import { pdfCommand } from "./commands/pdf.js";
import {
  recordStartCommand,
  recordStopCommand,
  recordSaveCommand,
  replayCommand,
} from "./commands/record.js";
import { runCommand } from "./commands/run.js";
import { authCommand } from "./commands/auth.js";

const program = new Command();

program
  .name("firecode")
  .description("Firefox browser automation for AI agents")
  .version("0.2.0");

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
    "Action: navigate, click, fill, select, type, wait, hover, evaluate, scroll, wait-for, reload, back, forward, keyboard, viewport, click-text, find-text, assert-text, wait-idle",
  )
  .argument("[args...]", "Action arguments")
  .option("--force", "Force action past overlays")
  .option("--soft", "Don't fail if element not found (for click-text)")
  .option("--wait-idle", "Wait for network idle after click")
  .option("--frame <selector>", "Operate inside an iframe (CSS selector)")
  .action((page, action, args, options) => {
    browseCommand(page, action, args, options);
  });

program
  .command("snapshot")
  .description("Get AI-friendly ARIA snapshot of a page")
  .argument("<page>", "Page name")
  .option("--interactive", "Only show interactive elements (buttons, inputs, links)")
  .option("--frame <selector>", "Snapshot inside an iframe (CSS selector)")
  .action((page, options) => {
    snapshotCommand(page, options);
  });

program
  .command("screenshot")
  .description("Capture a screenshot of a page")
  .argument("<page>", "Page name")
  .argument("[path]", "Output file path")
  .option("--diff <baseline>", "Compare against baseline screenshot (pixel-level)")
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

const cookies = program
  .command("cookies")
  .description("Show or set cookies for a page");

cookies
  .command("show", { isDefault: true })
  .description("Show cookies (values masked by default)")
  .argument("<page>", "Page name")
  .option("--unsafe-show-values", "Print raw cookie values (security risk)")
  .action((page, options) => {
    cookiesCommand(page, options);
  });

cookies
  .command("set")
  .description("Set a cookie on a page")
  .argument("<page>", "Page name")
  .argument("<name>", "Cookie name")
  .argument("<value>", "Cookie value")
  .requiredOption("--domain <domain>", "Cookie domain (e.g. example.com)")
  .option("--path <path>", "Cookie path", "/")
  .option("--expires <seconds>", "Unix timestamp in seconds (-1 for session)")
  .option("--http-only", "Set HttpOnly flag")
  .option("--secure", "Set Secure flag")
  .option("--same-site <value>", "Strict, Lax, or None", "Lax")
  .action((page, name, value, options) => {
    cookiesSetCommand(page, name, value, options);
  });

program
  .command("auth")
  .description(
    "Import cookies from your real Firefox into firecode (prompts for approval)",
  )
  .argument("<page>", "Page name")
  .argument("<domain>", "Domain to import cookies for (e.g. example.com)")
  .option("-y, --yes", "Skip the approval prompt")
  .action((page, domain, options) => {
    authCommand(page, domain, options);
  });

program
  .command("storage")
  .description("Show or clear localStorage/sessionStorage for a page")
  .argument("<page>", "Page name")
  .option("--session", "Show sessionStorage instead of localStorage")
  .option("--clear", "Clear storage (both by default, or just session with --session)")
  .action((page, options) => {
    storageCommand(page, options);
  });

program
  .command("run")
  .description("Run multiple actions in sequence (semicolon-separated)")
  .argument("<page>", "Page name")
  .argument("<commands>", 'Actions separated by semicolons, e.g. "click-text Aceptar --soft; click-text Omitir --soft"')
  .option("--strict", "Stop on first failure (default: continue on failure)")
  .action((page, commands, options) => {
    runCommand(page, commands, options);
  });

program
  .command("pdf")
  .description("Export page as PDF (headless mode only)")
  .argument("<page>", "Page name")
  .argument("[path]", "Output file path")
  .action(pdfCommand);

const record = program
  .command("record")
  .description("Record and replay interactions");

record
  .command("start")
  .description("Start recording actions on a page")
  .argument("<page>", "Page name")
  .action(recordStartCommand);

record
  .command("stop")
  .description("Stop recording and show captured steps")
  .argument("<page>", "Page name")
  .action(recordStopCommand);

record
  .command("save")
  .description("Save recording to a JSON file")
  .argument("<page>", "Page name")
  .argument("<path>", "Output file path")
  .action(recordSaveCommand);

program
  .command("replay")
  .description("Replay a saved recording")
  .argument("<page>", "Page name")
  .argument("<path>", "Recording JSON file")
  .action(replayCommand);

program
  .command("test")
  .description("Generate and run tests from git changes")
  .option(
    "-t, --target <target>",
    "Diff scope: unstaged, branch, changes",
    "changes",
  )
  .option("--base-url <url>", "App URL to test against", "http://localhost:3000")
  .option("-m, --message <msg>", "Targeted test instruction")
  .option("-y, --yes", "Skip plan review")
  .action((options) => {
    testCommand(options);
  });

program.parse();

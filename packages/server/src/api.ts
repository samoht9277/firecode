import { readFile } from "node:fs/promises";
import Fastify from "fastify";
import { PageManager } from "./pages.js";
import { getSnapshot, resolveRef } from "./snapshot.js";
import type { ActionRequest } from "./types.js";

function hasFlag(args: string[], flag: string): boolean {
  return args.includes(flag);
}

function getFlagValue(args: string[], flag: string): string | undefined {
  const idx = args.indexOf(flag);
  if (idx === -1 || idx + 1 >= args.length) return undefined;
  return args[idx + 1];
}

export function createApp(pageManager: PageManager) {
  const app = Fastify({ logger: false });

  app.get("/status", async () => {
    const pages = await pageManager.listPages();
    return { ok: true, pages: pages.length, pageList: pages };
  });

  app.get("/pages", async () => {
    return await pageManager.listPages();
  });

  app.post<{ Body: { name: string } }>("/pages", async (req) => {
    const { name } = req.body;
    return await pageManager.createPage(name);
  });

  app.get<{ Params: { name: string } }>(
    "/pages/:name/snapshot",
    async (req) => {
      const page = pageManager.getPage(req.params.name);
      const result = await getSnapshot(page);
      pageManager.setRefMap(req.params.name, result.refMap);
      return { snapshot: result.snapshot, refCount: result.refMap.refs.size };
    },
  );

  app.get<{ Params: { name: string } }>(
    "/pages/:name/text",
    async (req) => {
      const page = pageManager.getPage(req.params.name);
      const text = await page.innerText("body");
      return { text };
    },
  );

  app.get<{ Params: { name: string }; Querystring: { clear?: string } }>(
    "/pages/:name/console",
    async (req) => {
      const clear = req.query.clear === "true";
      const logs = pageManager.getConsoleLogs(req.params.name, clear);
      return { logs };
    },
  );

  app.get<{
    Params: { name: string };
    Querystring: { all?: string; clear?: string };
  }>("/pages/:name/network", async (req) => {
    const showAll = req.query.all === "true";
    const clear = req.query.clear === "true";
    let logs = pageManager.getNetworkLogs(req.params.name, clear);
    if (!showAll) {
      logs = logs.filter((entry) => entry.status >= 400);
    }
    return { logs };
  });

  app.post<{
    Params: { name: string };
    Body: { path?: string; diff?: string };
  }>("/pages/:name/screenshot", async (req) => {
    const page = pageManager.getPage(req.params.name);
    const screenshotPath =
      req.body?.path ?? `/tmp/firecode-screenshot-${Date.now()}.png`;
    await page.screenshot({ path: screenshotPath, fullPage: true });

    if (req.body?.diff) {
      const baselinePath = req.body.diff;
      const [baseline, current] = await Promise.all([
        readFile(baselinePath),
        readFile(screenshotPath),
      ]);

      if (baseline.length !== current.length) {
        return {
          ok: true,
          path: screenshotPath,
          diff: {
            changed: true,
            percent: 100,
            message: `Changed: images have different sizes (baseline: ${baseline.length} bytes, current: ${current.length} bytes)`,
          },
        };
      }

      let diffBytes = 0;
      const totalBytes = baseline.length;
      for (let i = 0; i < totalBytes; i++) {
        if (baseline[i] !== current[i]) diffBytes++;
      }
      const diffPercent = parseFloat(
        ((diffBytes / totalBytes) * 100).toFixed(2),
      );

      return {
        ok: true,
        path: screenshotPath,
        diff: {
          changed: diffPercent > 0,
          percent: diffPercent,
          message:
            diffPercent > 0
              ? `Changed: ${diffPercent}% of bytes differ`
              : "No changes detected",
        },
      };
    }

    return { ok: true, path: screenshotPath };
  });

  app.post<{ Params: { name: string }; Body: ActionRequest }>(
    "/pages/:name/action",
    async (req) => {
      const { action, args } = req.body;
      const page = pageManager.getPage(req.params.name);
      const refMap = pageManager.getRefMap(req.params.name);
      const force = hasFlag(args, "--force");

      switch (action) {
        case "navigate": {
          const url = args[0];
          if (!url) throw new Error("navigate requires a URL");
          await page.goto(url, { waitUntil: "domcontentloaded" });
          return { ok: true, message: `Navigated to ${url}` };
        }
        case "click": {
          const locator = resolveRef(page, refMap, args[0]);
          await locator.click({ force });
          return { ok: true, message: `Clicked ${args[0]}` };
        }
        case "fill": {
          const locator = resolveRef(page, refMap, args[0]);
          await locator.fill(args[1] ?? "", { force });
          return { ok: true, message: `Filled ${args[0]} with "${args[1]}"` };
        }
        case "select": {
          const locator = resolveRef(page, refMap, args[0]);
          await locator.selectOption(args[1] ?? "", { force });
          return { ok: true, message: `Selected "${args[1]}" on ${args[0]}` };
        }
        case "type": {
          const locator = resolveRef(page, refMap, args[0]);
          await locator.pressSequentially(args[1] ?? "", { delay: 50 });
          return { ok: true, message: `Typed "${args[1]}" into ${args[0]}` };
        }
        case "hover": {
          const locator = resolveRef(page, refMap, args[0]);
          await locator.hover({ force });
          return { ok: true, message: `Hovered ${args[0]}` };
        }
        case "wait": {
          const ms = parseInt(args[0] ?? "1000", 10);
          await page.waitForTimeout(ms);
          return { ok: true, message: `Waited ${ms}ms` };
        }
        case "evaluate": {
          const js = args[0];
          if (!js) throw new Error("evaluate requires a JS expression");
          const result = await page.evaluate(js);
          return {
            ok: true,
            message: JSON.stringify(result, null, 2) ?? "undefined",
          };
        }
        case "scroll": {
          const target = args[0];
          if (!target) throw new Error("scroll requires down, up, or a ref");
          if (target === "down") {
            await page.evaluate(() => window.scrollBy(0, window.innerHeight));
            return { ok: true, message: "Scrolled down" };
          }
          if (target === "up") {
            await page.evaluate(() => window.scrollBy(0, -window.innerHeight));
            return { ok: true, message: "Scrolled up" };
          }
          const locator = resolveRef(page, refMap, target);
          await locator.scrollIntoViewIfNeeded();
          return { ok: true, message: `Scrolled to ${target}` };
        }
        case "wait-for": {
          const text = args[0];
          if (!text) throw new Error("wait-for requires text or --selector");
          const timeout = parseInt(
            getFlagValue(args, "--timeout") ?? "10000",
            10,
          );
          if (hasFlag(args, "--selector")) {
            await page.waitForSelector(text, { timeout });
            return { ok: true, message: `Selector "${text}" appeared` };
          }
          await page.getByText(text).waitFor({ timeout });
          return { ok: true, message: `Text "${text}" appeared` };
        }
        case "reload": {
          await page.reload({ waitUntil: "domcontentloaded" });
          return { ok: true, message: `Reloaded, now at ${page.url()}` };
        }
        case "back": {
          await page.goBack({ waitUntil: "domcontentloaded" });
          return { ok: true, message: `Went back, now at ${page.url()}` };
        }
        case "forward": {
          await page.goForward({ waitUntil: "domcontentloaded" });
          return { ok: true, message: `Went forward, now at ${page.url()}` };
        }
        default:
          throw new Error(`Unknown action: ${action}`);
      }
    },
  );

  app.delete<{ Params: { name: string } }>("/pages/:name", async (req) => {
    await pageManager.closePage(req.params.name);
    return { ok: true, message: `Closed page "${req.params.name}"` };
  });

  app.post("/shutdown", async () => {
    setTimeout(async () => {
      await pageManager.closeAll();
      process.exit(0);
    }, 100);
    return { ok: true, message: "Shutting down" };
  });

  return app;
}

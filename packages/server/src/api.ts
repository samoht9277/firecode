import Fastify from "fastify";
import { PageManager } from "./pages.js";
import { getSnapshot, resolveRef } from "./snapshot.js";
import type { ActionRequest } from "./types.js";

export function createApp(pageManager: PageManager) {
  const app = Fastify({ logger: false });

  // Health check
  app.get("/status", async () => {
    const pages = await pageManager.listPages();
    return { ok: true, pages: pages.length, pageList: pages };
  });

  // List pages
  app.get("/pages", async () => {
    return await pageManager.listPages();
  });

  // Create page
  app.post<{ Body: { name: string } }>("/pages", async (req) => {
    const { name } = req.body;
    return await pageManager.createPage(name);
  });

  // Get snapshot
  app.get<{ Params: { name: string } }>(
    "/pages/:name/snapshot",
    async (req) => {
      const page = pageManager.getPage(req.params.name);
      const result = await getSnapshot(page);
      pageManager.setRefMap(req.params.name, result.refMap);
      return { snapshot: result.snapshot, refCount: result.refMap.refs.size };
    },
  );

  // Screenshot
  app.post<{ Params: { name: string }; Body: { path?: string } }>(
    "/pages/:name/screenshot",
    async (req) => {
      const page = pageManager.getPage(req.params.name);
      const screenshotPath =
        req.body?.path ?? `/tmp/firecode-screenshot-${Date.now()}.png`;
      await page.screenshot({ path: screenshotPath, fullPage: true });
      return { ok: true, path: screenshotPath };
    },
  );

  // Execute action
  app.post<{ Params: { name: string }; Body: ActionRequest }>(
    "/pages/:name/action",
    async (req) => {
      const { action, args } = req.body;
      const page = pageManager.getPage(req.params.name);
      const refMap = pageManager.getRefMap(req.params.name);

      switch (action) {
        case "navigate": {
          const url = args[0];
          if (!url) throw new Error("navigate requires a URL");
          await page.goto(url, { waitUntil: "domcontentloaded" });
          return { ok: true, message: `Navigated to ${url}` };
        }
        case "click": {
          const locator = resolveRef(page, refMap, args[0]);
          await locator.click();
          return { ok: true, message: `Clicked ${args[0]}` };
        }
        case "fill": {
          const locator = resolveRef(page, refMap, args[0]);
          await locator.fill(args[1] ?? "");
          return { ok: true, message: `Filled ${args[0]} with "${args[1]}"` };
        }
        case "select": {
          const locator = resolveRef(page, refMap, args[0]);
          await locator.selectOption(args[1] ?? "");
          return {
            ok: true,
            message: `Selected "${args[1]}" on ${args[0]}`,
          };
        }
        case "type": {
          const locator = resolveRef(page, refMap, args[0]);
          await locator.pressSequentially(args[1] ?? "", { delay: 50 });
          return {
            ok: true,
            message: `Typed "${args[1]}" into ${args[0]}`,
          };
        }
        case "hover": {
          const locator = resolveRef(page, refMap, args[0]);
          await locator.hover();
          return { ok: true, message: `Hovered ${args[0]}` };
        }
        case "wait": {
          const ms = parseInt(args[0] ?? "1000", 10);
          await page.waitForTimeout(ms);
          return { ok: true, message: `Waited ${ms}ms` };
        }
        default:
          throw new Error(`Unknown action: ${action}`);
      }
    },
  );

  // Close page
  app.delete<{ Params: { name: string } }>("/pages/:name", async (req) => {
    await pageManager.closePage(req.params.name);
    return { ok: true, message: `Closed page "${req.params.name}"` };
  });

  // Shutdown
  app.post("/shutdown", async () => {
    setTimeout(async () => {
      await pageManager.closeAll();
      process.exit(0);
    }, 100);
    return { ok: true, message: "Shutting down" };
  });

  return app;
}

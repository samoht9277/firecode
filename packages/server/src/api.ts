import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import Fastify from "fastify";
import pixelmatch from "pixelmatch";
import { PNG } from "pngjs";
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

  // Cookies
  app.get<{ Params: { name: string } }>(
    "/pages/:name/cookies",
    async (req) => {
      const page = pageManager.getPage(req.params.name);
      const cookies = await page.context().cookies();
      return { cookies };
    },
  );

  // Storage (localStorage + sessionStorage)
  app.get<{ Params: { name: string }; Querystring: { type?: string } }>(
    "/pages/:name/storage",
    async (req) => {
      const page = pageManager.getPage(req.params.name);
      const storageType = req.query.type ?? "local";
      const data = await page.evaluate((t) => {
        const storage = t === "session" ? sessionStorage : localStorage;
        const result: Record<string, string> = {};
        for (let i = 0; i < storage.length; i++) {
          const key = storage.key(i);
          if (key) result[key] = storage.getItem(key) ?? "";
        }
        return result;
      }, storageType);
      return { type: storageType, data };
    },
  );

  // Screenshot with pixel-level diff
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
      const [baselineBuf, currentBuf] = await Promise.all([
        readFile(baselinePath),
        readFile(screenshotPath),
      ]);

      const baseline = PNG.sync.read(baselineBuf);
      const current = PNG.sync.read(currentBuf);

      if (baseline.width !== current.width || baseline.height !== current.height) {
        return {
          ok: true,
          path: screenshotPath,
          diff: {
            changed: true,
            percent: 100,
            message: `Changed: different dimensions (${baseline.width}x${baseline.height} vs ${current.width}x${current.height})`,
          },
        };
      }

      const diffImg = new PNG({ width: baseline.width, height: baseline.height });
      const numDiffPixels = pixelmatch(
        baseline.data,
        current.data,
        diffImg.data,
        baseline.width,
        baseline.height,
        { threshold: 0.1 },
      );
      const totalPixels = baseline.width * baseline.height;
      const diffPercent = parseFloat(
        ((numDiffPixels / totalPixels) * 100).toFixed(2),
      );

      let diffPath: string | undefined;
      if (numDiffPixels > 0) {
        diffPath = screenshotPath.replace(/\.png$/, "-diff.png");
        await writeFile(diffPath, PNG.sync.write(diffImg));
      }

      return {
        ok: true,
        path: screenshotPath,
        diff: {
          changed: numDiffPixels > 0,
          percent: diffPercent,
          pixels: numDiffPixels,
          total: totalPixels,
          diffImage: diffPath,
          message:
            numDiffPixels > 0
              ? `Changed: ${diffPercent}% (${numDiffPixels}/${totalPixels} pixels differ)`
              : "No changes detected",
        },
      };
    }

    return { ok: true, path: screenshotPath };
  });

  // PDF
  app.post<{ Params: { name: string }; Body: { path?: string } }>(
    "/pages/:name/pdf",
    async (req) => {
      const page = pageManager.getPage(req.params.name);
      const pdfPath =
        req.body?.path ?? `/tmp/firecode-pdf-${Date.now()}.pdf`;
      await mkdir(dirname(pdfPath), { recursive: true });
      try {
        await page.pdf({ path: pdfPath, format: "A4" });
        return { ok: true, path: pdfPath };
      } catch {
        throw new Error(
          "PDF generation failed. Firefox PDF only works in headless mode.",
        );
      }
    },
  );

  // Recording endpoints
  app.post<{ Params: { name: string } }>(
    "/pages/:name/record/start",
    async (req) => {
      pageManager.startRecording(req.params.name);
      return { ok: true, message: "Recording started" };
    },
  );

  app.post<{ Params: { name: string } }>(
    "/pages/:name/record/stop",
    async (req) => {
      const recording = pageManager.stopRecording(req.params.name);
      return { ok: true, steps: recording.length, recording };
    },
  );

  app.post<{ Params: { name: string }; Body: { path: string } }>(
    "/pages/:name/record/save",
    async (req) => {
      const recording = pageManager.getRecording(req.params.name);
      const savePath = req.body.path;
      await writeFile(savePath, JSON.stringify(recording, null, 2));
      return { ok: true, path: savePath, steps: recording.length };
    },
  );

  app.post<{ Params: { name: string }; Body: { path: string } }>(
    "/pages/:name/replay",
    async (req) => {
      const raw = await readFile(req.body.path, "utf-8");
      const steps: Array<{ action: string; args: string[] }> = JSON.parse(raw);
      const page = pageManager.getPage(req.params.name);
      const results: string[] = [];

      for (const step of steps) {
        // Re-dispatch each step through the action handler
        const res = await app.inject({
          method: "POST",
          url: `/pages/${req.params.name}/action`,
          payload: { action: step.action, args: step.args },
        });
        const body = JSON.parse(res.body);
        results.push(body.message ?? body.error);
      }

      return { ok: true, steps: results.length, results };
    },
  );

  // Execute action
  app.post<{ Params: { name: string }; Body: ActionRequest }>(
    "/pages/:name/action",
    async (req) => {
      const { action, args } = req.body;
      const page = pageManager.getPage(req.params.name);
      const refMap = pageManager.getRefMap(req.params.name);
      const force = hasFlag(args, "--force");

      // Record the action if recording is active
      pageManager.recordAction(req.params.name, action, args);

      switch (action) {
        case "navigate": {
          const url = args[0];
          if (!url) throw new Error("navigate requires a URL");
          await page.goto(url, { waitUntil: "domcontentloaded" });
          return { ok: true, message: `Navigated to ${url}` };
        }
        case "click": {
          const locator = resolveRef(page, refMap, args[0]);
          await locator.click({ force, timeout: 5000 });
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
        case "keyboard": {
          const key = args[0];
          if (!key) throw new Error("keyboard requires a key name (e.g. ArrowRight, Enter, Space)");
          await page.keyboard.press(key);
          return { ok: true, message: `Pressed ${key}` };
        }
        case "viewport": {
          const presets: Record<string, { width: number; height: number }> = {
            mobile: { width: 375, height: 812 },
            tablet: { width: 768, height: 1024 },
            desktop: { width: 1920, height: 1080 },
            "desktop-hd": { width: 3840, height: 2160 },
          };
          const preset = presets[args[0]];
          if (preset) {
            await page.setViewportSize(preset);
            return { ok: true, message: `Viewport set to ${args[0]} (${preset.width}x${preset.height})` };
          }
          const width = parseInt(args[0], 10);
          const height = parseInt(args[1], 10);
          if (isNaN(width) || isNaN(height)) {
            throw new Error("viewport requires width height or a preset (mobile, tablet, desktop, desktop-hd)");
          }
          await page.setViewportSize({ width, height });
          return { ok: true, message: `Viewport set to ${width}x${height}` };
        }
        case "click-text": {
          const text = args[0];
          if (!text) throw new Error("click-text requires text to click");
          await page.getByText(text, { exact: false }).first().click({ force, timeout: 5000 });
          return { ok: true, message: `Clicked text "${text}"` };
        }
        case "assert-text": {
          const text = args[0];
          if (!text) throw new Error("assert-text requires text to check");
          const timeout = parseInt(getFlagValue(args, "--timeout") ?? "5000", 10);
          try {
            await page.getByText(text).waitFor({ timeout });
            return { ok: true, message: `PASS: "${text}" found on page` };
          } catch {
            throw new Error(`FAIL: "${text}" not found on page within ${timeout}ms`);
          }
        }
        case "wait-idle": {
          const timeout = parseInt(args[0] ?? "10000", 10);
          await page.waitForLoadState("networkidle", { timeout });
          return { ok: true, message: "Page is idle (no pending network requests)" };
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

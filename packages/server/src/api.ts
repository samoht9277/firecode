import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import Fastify from "fastify";
import pixelmatch from "pixelmatch";
import { PNG } from "pngjs";
import { PageManager } from "./pages.js";
import { getSnapshot, resolveRef } from "./snapshot.js";
import type { ActionRequest } from "./types.js";

const ALLOWED_DIRS = ["/tmp", process.env.HOME + "/.firecode", process.cwd()];

function validatePath(filePath: string): string {
  const resolved = resolve(filePath);
  const allowed = ALLOWED_DIRS.some((dir) => dir && resolved.startsWith(resolve(dir)));
  if (!allowed) {
    throw new Error(`Path "${filePath}" is outside allowed directories (${ALLOWED_DIRS.join(", ")})`);
  }
  return resolved;
}

function hasFlag(args: string[], flag: string): boolean {
  return args.includes(flag);
}

function getFlagValue(args: string[], flag: string): string | undefined {
  const idx = args.indexOf(flag);
  if (idx === -1 || idx + 1 >= args.length) return undefined;
  return args[idx + 1];
}

export function createApp(pageManager: PageManager, authToken: string) {
  const app = Fastify({ logger: false });

  app.addHook("onRequest", async (req, reply) => {
    if (req.url === "/status") return;
    const header = req.headers.authorization;
    if (header !== `Bearer ${authToken}`) {
      reply.status(401).send({ message: "Unauthorized" });
    }
  });

  app.setErrorHandler(async (error: any, _req, reply) => {
    const message = (error.message ?? String(error))
      .replace(/\x1b\[[0-9;]*m/g, "") // strip ANSI
      .split("\n")[0]; // first line only
    reply.status(400).send({ message });
  });

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

  app.get<{
    Params: { name: string };
    Querystring: { interactive?: string; frame?: string };
  }>(
    "/pages/:name/snapshot",
    async (req) => {
      const page = pageManager.getPage(req.params.name);
      const interactiveOnly = req.query.interactive === "true";
      const frame = req.query.frame || undefined;
      const result = await getSnapshot(page, { interactiveOnly, frame });
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

  app.get<{ Params: { name: string } }>(
    "/pages/:name/cookies",
    async (req) => {
      const page = pageManager.getPage(req.params.name);
      const cookies = await page.context().cookies();
      return { cookies };
    },
  );

  app.post<{ Params: { name: string }; Body: { cookies: any[] } }>(
    "/pages/:name/cookies",
    async (req) => {
      const page = pageManager.getPage(req.params.name);
      await page.context().addCookies(req.body.cookies);
      return {
        ok: true,
        message: `Imported ${req.body.cookies.length} cookies`,
      };
    },
  );

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

  app.post<{ Params: { name: string }; Body: { type?: string } }>(
    "/pages/:name/storage/clear",
    async (req) => {
      const page = pageManager.getPage(req.params.name);
      const storageType = req.body?.type ?? "all";
      await page.evaluate((t) => {
        if (t === "local" || t === "all") localStorage.clear();
        if (t === "session" || t === "all") sessionStorage.clear();
      }, storageType);
      return { ok: true, message: `Cleared ${storageType === "all" ? "localStorage and sessionStorage" : storageType + "Storage"}` };
    },
  );

  app.post<{
    Params: { name: string };
    Body: { path?: string; diff?: string };
  }>("/pages/:name/screenshot", async (req) => {
    const page = pageManager.getPage(req.params.name);
    const screenshotPath = validatePath(
      req.body?.path ?? `/tmp/firecode-screenshot-${Date.now()}.png`,
    );
    await page.screenshot({ path: screenshotPath, fullPage: true });

    if (req.body?.diff) {
      const baselinePath = validatePath(req.body.diff);
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

  app.post<{ Params: { name: string }; Body: { path?: string } }>(
    "/pages/:name/pdf",
    async (req) => {
      const page = pageManager.getPage(req.params.name);
      const pdfPath = validatePath(
        req.body?.path ?? `/tmp/firecode-pdf-${Date.now()}.pdf`,
      );
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
      const savePath = validatePath(req.body.path);
      await writeFile(savePath, JSON.stringify(recording, null, 2));
      return { ok: true, path: savePath, steps: recording.length };
    },
  );

  app.post<{ Params: { name: string }; Body: { path: string } }>(
    "/pages/:name/replay",
    async (req) => {
      const replayPath = validatePath(req.body.path);
      const raw = await readFile(replayPath, "utf-8");
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

  app.post<{
    Params: { name: string };
    Body: { commands: string; soft?: boolean };
  }>("/pages/:name/run", async (req) => {
    const commands = req.body.commands.split(";").map((s) => s.trim()).filter(Boolean);
    const soft = req.body.soft ?? true;
    const results: string[] = [];

    await pageManager.createPage(req.params.name);

    for (const cmd of commands) {
      const parts = cmd.match(/(?:[^\s"]+|"[^"]*")+/g) ?? [];
      const action = parts[0];
      const args = parts.slice(1).map((a) => a.replace(/^"|"$/g, ""));

      const res = await app.inject({
        method: "POST",
        url: `/pages/${req.params.name}/action`,
        payload: { action, args },
      });
      const body = JSON.parse(res.body);

      if (res.statusCode >= 400) {
        results.push(`FAIL: ${action} — ${body.message}`);
        if (!soft) break;
      } else {
        results.push(body.message);
      }
    }

    return { ok: true, results };
  });

  app.post<{ Params: { name: string }; Body: ActionRequest }>(
    "/pages/:name/action",
    async (req) => {
      const { action, args } = req.body;
      const page = pageManager.getPage(req.params.name);
      const refMap = pageManager.getRefMap(req.params.name);
      const force = hasFlag(args, "--force");
      const waitIdle = hasFlag(args, "--wait-idle");
      const frame = getFlagValue(args, "--frame");

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
          const locator = resolveRef(page, refMap, args[0], frame);
          await locator.click({ force, timeout: 5000 });
          if (waitIdle) {
            await page.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});
          }
          return { ok: true, message: `Clicked ${args[0]}${waitIdle ? " (idle)" : ""}` };
        }
        case "fill": {
          const locator = resolveRef(page, refMap, args[0], frame);
          // Click to focus first (helps React-controlled inputs)
          await locator.click({ force, timeout: 5000 });
          await locator.fill(args[1] ?? "", { force });
          // Dispatch events for React's synthetic event system
          await locator.dispatchEvent("input", { bubbles: true });
          await locator.dispatchEvent("change", { bubbles: true });
          return { ok: true, message: `Filled ${args[0]} with "${args[1]}"` };
        }
        case "select": {
          const locator = resolveRef(page, refMap, args[0], frame);
          await locator.selectOption(args[1] ?? "", { force });
          return { ok: true, message: `Selected "${args[1]}" on ${args[0]}` };
        }
        case "type": {
          const locator = resolveRef(page, refMap, args[0], frame);
          await locator.click({ force, timeout: 5000 });
          await locator.pressSequentially(args[1] ?? "", { delay: 50 });
          return { ok: true, message: `Typed "${args[1]}" into ${args[0]}` };
        }
        case "hover": {
          const locator = resolveRef(page, refMap, args[0], frame);
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
            result,
            message: JSON.stringify(result, null, 2) ?? "undefined",
          };
        }
        case "scroll": {
          const target = args[0];
          if (!target) throw new Error("scroll requires down, up, or a ref");
          const times = parseInt(args[1] ?? "1", 10) || 1;
          if (target === "down") {
            await page.evaluate((n) => {
              for (let i = 0; i < n; i++) window.scrollBy(0, window.innerHeight);
            }, times);
            return { ok: true, message: times > 1 ? `Scrolled down ${times}x` : "Scrolled down" };
          }
          if (target === "up") {
            await page.evaluate((n) => {
              for (let i = 0; i < n; i++) window.scrollBy(0, -window.innerHeight);
            }, times);
            return { ok: true, message: times > 1 ? `Scrolled up ${times}x` : "Scrolled up" };
          }
          const locator = resolveRef(page, refMap, target, frame);
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
          const soft = hasFlag(args, "--soft");
          const root = frame ? page.frameLocator(frame) : page;
          const locator = root.getByText(text, { exact: false }).first();
          try {
            await locator.click({ force, timeout: 5000 });
            return { ok: true, message: `Clicked text "${text}"` };
          } catch {
            if (soft) {
              return { ok: true, message: `Text "${text}" not found (--soft, no error)` };
            }
            throw new Error(`click-text: "${text}" not found or not clickable`);
          }
        }
        case "find-text": {
          const text = args[0];
          if (!text) throw new Error("find-text requires text to search for");
          const root = frame ? page.frameLocator(frame) : page;
          const matches = root.getByText(text, { exact: false });
          const count = await matches.count();
          if (count === 0) {
            return { ok: true, message: `No matches for "${text}"` };
          }
          const results: string[] = [];
          for (let i = 0; i < Math.min(count, 10); i++) {
            const el = matches.nth(i);
            const info = await el.evaluate((e) => ({
              tag: e.tagName.toLowerCase(),
              role: e.getAttribute("role") ?? "",
              text: e.textContent?.slice(0, 80)?.trim() ?? "",
            }));
            const visible = await el.isVisible();
            const roleStr = info.role ? ` role="${info.role}"` : "";
            const visStr = visible ? "" : " (hidden)";
            results.push(`  ${i + 1}. <${info.tag}${roleStr}>${visStr} — "${info.text}"`);
          }
          return {
            ok: true,
            message: `Found ${count} match${count > 1 ? "es" : ""} for "${text}":\n${results.join("\n")}`,
          };
        }
        case "assert-text": {
          const text = args[0];
          if (!text) throw new Error("assert-text requires text to check");
          const timeout = parseInt(getFlagValue(args, "--timeout") ?? "5000", 10);
          const root = frame ? page.frameLocator(frame) : page;
          try {
            await root.getByText(text).waitFor({ timeout });
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

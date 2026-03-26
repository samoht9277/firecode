import type { BrowserContext, Page } from "playwright";
import type { PageInfo, RefMap, ConsoleEntry, NetworkEntry } from "./types.js";

interface PageEntry {
  page: Page;
  refMap: RefMap;
  consoleLogs: ConsoleEntry[];
  networkLogs: NetworkEntry[];
}

export class PageManager {
  private pages = new Map<string, PageEntry>();
  private context: BrowserContext | null = null;

  setContext(context: BrowserContext): void {
    this.context = context;
  }

  private attachListeners(page: Page, entry: PageEntry): void {
    page.on("console", (msg) => {
      entry.consoleLogs.push({
        type: msg.type(),
        text: msg.text(),
        timestamp: Date.now(),
      });
    });

    page.on("response", (res) => {
      entry.networkLogs.push({
        status: res.status(),
        method: res.request().method(),
        url: res.url(),
        timestamp: Date.now(),
      });
    });
  }

  async createPage(name: string): Promise<PageInfo> {
    if (this.pages.has(name)) {
      const existing = this.pages.get(name)!;
      return {
        name,
        url: existing.page.url(),
        title: await existing.page.title(),
      };
    }

    if (!this.context) {
      throw new Error("Browser not connected");
    }

    const existingPages = this.context.pages();
    const blankPage = existingPages.find(
      (p) => p.url() === "about:blank" || p.url() === "",
    );

    let page: Page;
    if (blankPage) {
      page = blankPage;
    } else if (existingPages.length > 0) {
      const [newPage] = await Promise.all([
        this.context.waitForEvent("page"),
        existingPages[existingPages.length - 1].evaluate(() =>
          window.open("about:blank"),
        ),
      ]);
      page = newPage;
    } else {
      page = await this.context.newPage();
    }

    const entry: PageEntry = {
      page,
      refMap: { refs: new Map(), timestamp: 0 },
      consoleLogs: [],
      networkLogs: [],
    };
    this.attachListeners(page, entry);
    this.pages.set(name, entry);

    return { name, url: page.url(), title: await page.title() };
  }

  getPage(name: string): Page {
    const entry = this.pages.get(name);
    if (!entry) {
      throw new Error(
        `Page "${name}" not found. Use "firecode browse ${name} navigate <url>" to create it.`,
      );
    }
    return entry.page;
  }

  getRefMap(name: string): RefMap {
    const entry = this.pages.get(name);
    if (!entry) {
      throw new Error(`Page "${name}" not found`);
    }
    return entry.refMap;
  }

  setRefMap(name: string, refMap: RefMap): void {
    const entry = this.pages.get(name);
    if (!entry) {
      throw new Error(`Page "${name}" not found`);
    }
    entry.refMap = refMap;
  }

  getConsoleLogs(name: string, clear: boolean): ConsoleEntry[] {
    const entry = this.pages.get(name);
    if (!entry) {
      throw new Error(`Page "${name}" not found`);
    }
    const logs = [...entry.consoleLogs];
    if (clear) entry.consoleLogs = [];
    return logs;
  }

  getNetworkLogs(name: string, clear: boolean): NetworkEntry[] {
    const entry = this.pages.get(name);
    if (!entry) {
      throw new Error(`Page "${name}" not found`);
    }
    const logs = [...entry.networkLogs];
    if (clear) entry.networkLogs = [];
    return logs;
  }

  async listPages(): Promise<PageInfo[]> {
    const result: PageInfo[] = [];
    for (const [name, entry] of this.pages) {
      result.push({
        name,
        url: entry.page.url(),
        title: await entry.page.title(),
      });
    }
    return result;
  }

  async closePage(name: string): Promise<void> {
    const entry = this.pages.get(name);
    if (!entry) return;
    await entry.page.close();
    this.pages.delete(name);
  }

  async closeAll(): Promise<void> {
    for (const name of this.pages.keys()) {
      await this.closePage(name);
    }
  }
}

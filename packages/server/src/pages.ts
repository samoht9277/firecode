import type { Browser, BrowserContext, Page } from "playwright";
import type { PageInfo, RefMap } from "./types.js";

interface PageEntry {
  page: Page;
  refMap: RefMap;
}

export class PageManager {
  private pages = new Map<string, PageEntry>();
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;

  setBrowser(browser: Browser): void {
    this.browser = browser;
  }

  private async getContext(): Promise<BrowserContext> {
    if (this.context) return this.context;
    if (!this.browser) throw new Error("Browser not connected");

    // Reuse the default context (the window that launched with the browser)
    // so everything stays in one OS window as tabs
    const contexts = this.browser.contexts();
    if (contexts.length > 0) {
      this.context = contexts[0];
    } else {
      this.context = await this.browser.newContext();
    }

    // Hide automation signals so sites don't detect Playwright
    await this.context.addInitScript(() => {
      Object.defineProperty(navigator, "webdriver", { get: () => false });
    });

    return this.context;
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

    const context = await this.getContext();

    // Reuse the blank tab if this is the first page
    const existingPages = context.pages();
    const blankPage = existingPages.find(
      (p) => p.url() === "about:blank" || p.url() === "",
    );
    const page = blankPage ?? (await context.newPage());
    this.pages.set(name, {
      page,
      refMap: { refs: new Map(), timestamp: 0 },
    });

    return { name, url: page.url(), title: await page.title() };
  }

  getPage(name: string): Page {
    const entry = this.pages.get(name);
    if (!entry) {
      throw new Error(`Page "${name}" not found. Use "firecode browse ${name} navigate <url>" to create it.`);
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

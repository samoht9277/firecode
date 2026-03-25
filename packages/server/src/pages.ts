import type { Browser, BrowserContext, Page } from "playwright";
import type { PageInfo, RefMap } from "./types.js";

interface PageEntry {
  page: Page;
  context: BrowserContext;
  refMap: RefMap;
}

export class PageManager {
  private pages = new Map<string, PageEntry>();
  private browser: Browser | null = null;

  setBrowser(browser: Browser): void {
    this.browser = browser;
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

    if (!this.browser) {
      throw new Error("Browser not connected");
    }

    const context = await this.browser.newContext();
    const page = await context.newPage();
    this.pages.set(name, {
      page,
      context,
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
    await entry.context.close();
    this.pages.delete(name);
  }

  async closeAll(): Promise<void> {
    for (const name of this.pages.keys()) {
      await this.closePage(name);
    }
  }
}

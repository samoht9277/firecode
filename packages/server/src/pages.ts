import type { Browser, BrowserContext, Page } from "playwright";
import type { PageInfo, RefMap, ConsoleEntry, NetworkEntry } from "./types.js";

interface RecordedStep {
  action: string;
  args: string[];
  timestamp: number;
}

interface PageEntry {
  page: Page;
  refMap: RefMap;
  consoleLogs: ConsoleEntry[];
  networkLogs: NetworkEntry[];
  recording: RecordedStep[];
  isRecording: boolean;
}

interface AuthImport {
  domains: Set<string>;
  expiresAt: number;
}

export class PageManager {
  private pages = new Map<string, PageEntry>();
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private authImports: AuthImport[] = [];
  private sweepTimer: NodeJS.Timeout | null = null;

  setBrowser(browser: Browser): void {
    this.browser = browser;
    if (!this.sweepTimer) {
      this.sweepTimer = setInterval(() => {
        this.sweepExpiredAuth().catch(() => {});
      }, 30_000);
      this.sweepTimer.unref?.();
    }
  }

  trackAuthImport(domains: string[], ttlSeconds: number): void {
    if (!domains.length || ttlSeconds <= 0) return;
    this.authImports.push({
      domains: new Set(domains),
      expiresAt: Date.now() + ttlSeconds * 1000,
    });
  }

  private async sweepExpiredAuth(): Promise<void> {
    if (!this.context) return;
    const now = Date.now();
    const expired: string[] = [];
    const remaining: AuthImport[] = [];
    for (const imp of this.authImports) {
      if (imp.expiresAt <= now) {
        for (const d of imp.domains) expired.push(d);
      } else {
        remaining.push(imp);
      }
    }
    if (!expired.length) return;
    this.authImports = remaining;
    const unique = [...new Set(expired)];
    for (const domain of unique) {
      try {
        await this.context.clearCookies({ domain });
      } catch {}
    }
    console.error(
      `[firecode] auth cookies expired for: ${unique.join(", ")}`,
    );
  }

  private async getContext(): Promise<BrowserContext> {
    if (this.context) return this.context;
    if (!this.browser) throw new Error("Browser not connected");
    this.context = await this.browser.newContext();
    await this.context.addInitScript(() => {
      Object.defineProperty(navigator, "webdriver", { get: () => false });
    });
    return this.context;
  }

  private attachListeners(page: Page, entry: PageEntry): void {
    page.on("console", (msg) => {
      entry.consoleLogs.push({
        type: msg.type(),
        text: msg.text(),
        timestamp: Date.now(),
      });
      if (entry.consoleLogs.length > 1000) entry.consoleLogs.shift();
    });

    page.on("response", (res) => {
      entry.networkLogs.push({
        status: res.status(),
        method: res.request().method(),
        url: res.url(),
        timestamp: Date.now(),
      });
      if (entry.networkLogs.length > 1000) entry.networkLogs.shift();
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

    const context = await this.getContext();
    const existingPages = context.pages();
    const blankPage = existingPages.find(
      (p) => p.url() === "about:blank" || p.url() === "",
    );

    let page: Page;
    if (blankPage) {
      page = blankPage;
    } else if (existingPages.length > 0) {
      const [newPage] = await Promise.all([
        context.waitForEvent("page"),
        existingPages[existingPages.length - 1].evaluate(() =>
          window.open("about:blank"),
        ),
      ]);
      page = newPage;
    } else {
      page = await context.newPage();
    }

    const entry: PageEntry = {
      page,
      refMap: { refs: new Map(), timestamp: 0 },
      consoleLogs: [],
      networkLogs: [],
      recording: [],
      isRecording: false,
    };
    this.attachListeners(page, entry);
    this.pages.set(name, entry);

    return { name, url: page.url(), title: await page.title() };
  }

  private getEntry(name: string): PageEntry {
    const entry = this.pages.get(name);
    if (!entry) {
      throw new Error(
        `Page "${name}" not found. Use "firecode browse ${name} navigate <url>" to create it.`,
      );
    }
    return entry;
  }

  getPage(name: string): Page {
    return this.getEntry(name).page;
  }

  getRefMap(name: string): RefMap {
    return this.getEntry(name).refMap;
  }

  setRefMap(name: string, refMap: RefMap): void {
    this.getEntry(name).refMap = refMap;
  }

  getConsoleLogs(name: string, clear: boolean): ConsoleEntry[] {
    const entry = this.getEntry(name);
    const logs = [...entry.consoleLogs];
    if (clear) entry.consoleLogs = [];
    return logs;
  }

  getNetworkLogs(name: string, clear: boolean): NetworkEntry[] {
    const entry = this.getEntry(name);
    const logs = [...entry.networkLogs];
    if (clear) entry.networkLogs = [];
    return logs;
  }

  startRecording(name: string): void {
    const entry = this.getEntry(name);
    entry.recording = [];
    entry.isRecording = true;
  }

  stopRecording(name: string): RecordedStep[] {
    const entry = this.getEntry(name);
    entry.isRecording = false;
    return [...entry.recording];
  }

  getRecording(name: string): RecordedStep[] {
    return [...this.getEntry(name).recording];
  }

  recordAction(name: string, action: string, args: string[]): void {
    const entry = this.pages.get(name);
    if (entry?.isRecording) {
      entry.recording.push({ action, args, timestamp: Date.now() });
    }
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
    if (this.sweepTimer) {
      clearInterval(this.sweepTimer);
      this.sweepTimer = null;
    }
    for (const name of this.pages.keys()) {
      await this.closePage(name);
    }
  }
}

import { existsSync } from "node:fs";
import { chromium, type Browser, type BrowserContext, type Page } from "playwright-core";

export type BrowserNavigationResult = {
  status: number;
  contentType: string | null;
  body: string;
  retryAfter: string | null;
};

export interface WikiTreeBrowserTransport {
  navigate(url: URL): Promise<BrowserNavigationResult>;
  close(): Promise<void>;
}

const CHROME_PATHS = [
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
];

function installedChromePath(): string {
  const configured = process.env.WIKITREE_CHROME_PATH?.trim();
  if (configured && existsSync(configured)) return configured;
  const detected = CHROME_PATHS.find(existsSync);
  if (!detected) throw new Error("A local Google Chrome installation was not found");
  return detected;
}

export class PlaywrightChromeTransport implements WikiTreeBrowserTransport {
  private browser?: Browser;
  private context?: BrowserContext;
  private page?: Page;

  private async getPage(): Promise<Page> {
    if (this.page) return this.page;
    this.browser = await chromium.launch({
      executablePath: installedChromePath(),
      headless: true,
    });
    this.context = await this.browser.newContext();
    this.page = await this.context.newPage();
    return this.page;
  }

  async navigate(url: URL): Promise<BrowserNavigationResult> {
    if (url.origin + url.pathname !== "https://api.wikitree.com/api.php") {
      throw new Error("Browser transport rejected a non-WikiTree destination");
    }
    const response = await (await this.getPage()).goto(url.href, {
      waitUntil: "domcontentloaded",
      timeout: 30_000,
    });
    if (!response) throw new Error("Chrome navigation produced no HTTP response");
    const headers = await response.allHeaders();
    return {
      status: response.status(),
      contentType: headers["content-type"] ?? null,
      body: await response.text(),
      retryAfter: headers["retry-after"] ?? null,
    };
  }

  async close(): Promise<void> {
    const page = this.page;
    const context = this.context;
    const browser = this.browser;
    this.page = undefined;
    this.context = undefined;
    this.browser = undefined;
    await page?.close().catch(() => undefined);
    await context?.close().catch(() => undefined);
    await browser?.close().catch(() => undefined);
  }
}

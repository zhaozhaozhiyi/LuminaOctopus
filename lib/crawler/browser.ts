import fs from 'node:fs/promises';
import type { BrowserResponseRecord, RenderPageResult } from './types';

const EXECUTABLE_CANDIDATES = [
  process.env.PLAYWRIGHT_EXECUTABLE_PATH,
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
].filter(Boolean) as string[];

async function pickExecutablePath(): Promise<string> {
  for (const candidate of EXECUTABLE_CANDIDATES) {
    try {
      await fs.access(candidate);
      return candidate;
    } catch {
      continue;
    }
  }
  throw new Error('No supported Chrome/Chromium executable was found. Set PLAYWRIGHT_EXECUTABLE_PATH to continue.');
}

async function autoScroll(page: import('playwright').Page): Promise<void> {
  await page.evaluate(async () => {
    const maxSteps = 8;
    const delay = 180;
    for (let step = 0; step < maxSteps; step += 1) {
      window.scrollTo(0, document.body.scrollHeight);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
    window.scrollTo(0, 0);
  });
}

export class BrowserRenderer {
  private browser: import('playwright').Browser | null = null;
  private executablePathPromise: Promise<string> | null = null;
  private userAgent: string;

  constructor(userAgent: string) {
    this.userAgent = userAgent;
  }

  private async getBrowser(): Promise<import('playwright').Browser> {
    if (this.browser) return this.browser;
    if (!this.executablePathPromise) {
      this.executablePathPromise = pickExecutablePath();
    }
    const { chromium } = await import('playwright');
    this.browser = await chromium.launch({
      executablePath: await this.executablePathPromise,
      headless: true,
      args: ['--disable-dev-shm-usage', '--disable-background-networking'],
    });
    return this.browser;
  }

  async dispose(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
  }

  async renderPage(url: string): Promise<RenderPageResult> {
    const browser = await this.getBrowser();
    const context = await browser.newContext({
      ignoreHTTPSErrors: true,
      serviceWorkers: 'block',
      userAgent: this.userAgent,
      viewport: { width: 1440, height: 900 },
    });
    await context.addInitScript(() => {
      try {
        if ('serviceWorker' in navigator) {
          Object.defineProperty(navigator, 'serviceWorker', {
            configurable: true,
            value: {
              register: async () => ({}),
              getRegistrations: async () => [],
              ready: Promise.resolve({}),
            },
          });
        }
      } catch {}
    });

    const page = await context.newPage();
    const networkRecords: BrowserResponseRecord[] = [];

    page.on('response', async (response) => {
      const request = response.request();
      const resourceType = request.resourceType();
      networkRecords.push({
        url: response.url(),
        resourceType:
          resourceType === 'document' ||
          resourceType === 'stylesheet' ||
          resourceType === 'script' ||
          resourceType === 'image' ||
          resourceType === 'media' ||
          resourceType === 'font' ||
          resourceType === 'xhr' ||
          resourceType === 'fetch'
            ? resourceType
            : 'other',
        status: response.status(),
        contentType: response.headers()['content-type'],
      });
    });

    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
      try {
        await page.waitForLoadState('networkidle', { timeout: 8000 });
      } catch {}
      await autoScroll(page);
      return {
        requestedUrl: url,
        finalUrl: page.url(),
        html: await page.content(),
        htmlContentType: 'text/html; charset=utf-8',
        networkRecords,
      };
    } finally {
      await page.close();
      await context.close();
    }
  }
}

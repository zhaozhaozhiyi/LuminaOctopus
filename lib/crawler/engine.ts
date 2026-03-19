/**
 * 爬虫引擎：队列、抓取、解析、状态
 * 纯 Node 逻辑，无 Next/React，供 API 与日后 Electron main 复用
 */

import type { CrawlItem, CrawlState, CrawlOptions } from './types';
import { BrowserRenderer } from './browser';
import { rewriteCssText, rewriteHtmlDocument } from './rewriter';
import { getLocalPathForUrl, isSameOrigin, normalizeUrl } from './url-utils';

const DEFAULT_OPTIONS: Partial<CrawlOptions> = {
  maxDepth: 2,
  maxConcurrent: 3,
  sameSitePagesOnly: true,
  respectRobots: true,
  delayMs: 200,
  renderMode: 'browser',
};

type OnStateChange = (state: CrawlState) => void;

export class CrawlEngine {
  private options: Required<
    Pick<
      CrawlOptions,
      | 'baseUrl'
      | 'maxDepth'
      | 'maxConcurrent'
      | 'sameSitePagesOnly'
      | 'respectRobots'
      | 'delayMs'
      | 'renderMode'
      | 'jobId'
      | 'outputPath'
    >
  >;
  private state: CrawlState;
  private seen = new Set<string>();
  private skipped = new Set<string>();
  private queue: Array<{ url: string; level: number; kind: CrawlItem['kind'] }> = [];
  private active = 0;
  private abortController: AbortController | null = null;
  private onStateChange: OnStateChange;
  private browserRenderer: BrowserRenderer | null = null;
  /** 已下载内容：path -> { contentType, body }，Web 版可据此打包 zip；Electron 可改为写文件 */
  private downloaded = new Map<string, { contentType: string; body: string | Buffer; url: string }>();

  constructor(options: CrawlOptions, onStateChange: OnStateChange) {
    const maxDepth = options.maxDepth ?? options.maxLevel ?? DEFAULT_OPTIONS.maxDepth ?? 2;
    const sameSitePagesOnly = options.sameSitePagesOnly ?? options.sameOriginOnly ?? DEFAULT_OPTIONS.sameSitePagesOnly ?? true;
    const respectRobots = options.respectRobots ?? DEFAULT_OPTIONS.respectRobots ?? true;
    const renderMode = options.renderMode ?? DEFAULT_OPTIONS.renderMode ?? 'browser';
    const jobId = options.jobId ?? 'local';
    const outputPath = options.outputPath ?? '';
    const maxConcurrent = options.maxConcurrent ?? DEFAULT_OPTIONS.maxConcurrent ?? 3;
    const delayMs = options.delayMs ?? DEFAULT_OPTIONS.delayMs ?? 200;

    this.options = {
      ...options,
      baseUrl: options.baseUrl,
      maxDepth,
      sameSitePagesOnly,
      respectRobots,
      renderMode,
      jobId,
      outputPath,
      maxConcurrent,
      delayMs,
    } as Required<CrawlOptions>;

    const baseUrl = normalizeUrl(options.baseUrl);
    this.state = {
      status: 'idle',
      jobId,
      outputPath,
      renderMode,
      baseUrl,
      maxDepth,
      maxConcurrent,
      sameSitePagesOnly,
      delayMs,
      respectRobots,
      filesDownloaded: 0,
      filesRemaining: 0,
      pagesDiscovered: 0,
      assetsDownloaded: 0,
      degradedPages: 0,
      errors: 0,
      items: [],
      warnings: [],
      lastUpdatedAt: Date.now(),
    };
    this.onStateChange = onStateChange;
  }

  private urlDedupeKey(url: string): string {
    // 去重关键：不考虑 hash，但保留 pathname（尾斜杠会影响本地路径映射）
    try {
      const u = new URL(url);
      u.hash = '';
      return u.toString();
    } catch {
      return url;
    }
  }

  private getBrowserRenderer(): BrowserRenderer {
    if (!this.browserRenderer) {
      this.browserRenderer = new BrowserRenderer('LuminaOctopus/1.0');
    }
    return this.browserRenderer;
  }

  getState(): CrawlState {
    return { ...this.state, lastUpdatedAt: this.state.lastUpdatedAt };
  }

  /** 供 Electron 或 API 获取已下载内容，用于打包 zip 或写磁盘 */
  getDownloaded(): Map<string, { contentType: string; body: string | Buffer; url: string }> {
    return new Map(this.downloaded);
  }

  private emit() {
    this.state.lastUpdatedAt = Date.now();
    this.onStateChange(this.getState());
  }

  async start(): Promise<void> {
    if (this.state.status === 'running') return;
    this.abortController = new AbortController();
    this.seen.clear();
    this.skipped.clear();
    this.queue = [];
    this.downloaded.clear();
    const baseUrl = this.state.baseUrl;
    this.state = {
      status: 'running',
      jobId: this.options.jobId,
      outputPath: this.options.outputPath,
      renderMode: this.options.renderMode,
      baseUrl,
      maxDepth: this.options.maxDepth,
      maxConcurrent: this.options.maxConcurrent,
      sameSitePagesOnly: this.options.sameSitePagesOnly,
      delayMs: this.options.delayMs,
      respectRobots: this.options.respectRobots,
      filesDownloaded: 0,
      filesRemaining: 0,
      pagesDiscovered: 0,
      assetsDownloaded: 0,
      degradedPages: 0,
      errors: 0,
      items: [],
      warnings: [],
      lastUpdatedAt: Date.now(),
      startedAt: Date.now(),
      stoppedAt: undefined,
      lastError: undefined,
      resumeAvailable: true,
    };
    this.queue.push({ url: baseUrl, level: 0, kind: 'page' });
    this.seen.add(this.urlDedupeKey(baseUrl));
    this.emit();
    this.processQueue();
  }

  pause(): void {
    if (this.state.status === 'running') {
      this.state.status = 'paused';
      this.state.resumeAvailable = this.queue.length > 0 || this.active > 0;
      this.emit();
    }
  }

  resume(): void {
    if (this.state.status === 'paused') {
      this.state.status = 'running';
      this.state.stoppedAt = undefined;
      this.state.resumeAvailable = true;
      this.emit();
      this.processQueue();
    }
  }

  stop(): void {
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
    if (this.state.status === 'running' || this.state.status === 'paused') {
      this.state.status = 'stopped';
      this.state.stoppedAt = Date.now();
      this.state.resumeAvailable = this.queue.length > 0 || this.active > 0;
      this.emit();
    }
  }

  /**
   * Skip a URL: remove it from pending queue, mark queued items as skipped,
   * and prevent the same URL from being re-enqueued in the future.
   */
  skip(url: string): { removedFromQueue: number; markedInItems: number } {
    const key = this.urlDedupeKey(url);
    this.skipped.add(key);

    const before = this.queue.length;
    this.queue = this.queue.filter((entry) => this.urlDedupeKey(entry.url) !== key);
    const removedFromQueue = before - this.queue.length;

    let markedInItems = 0;
    for (const item of this.state.items) {
      if (this.urlDedupeKey(item.url) !== key) continue;
      if (item.status === 'queued') {
        item.status = 'skipped';
        item.progress = 100;
        item.updatedAt = Date.now();
        markedInItems += 1;
      }
    }

    this.state.filesRemaining = this.queue.length + this.active;
    this.state.resumeAvailable =
      this.state.status === 'paused' || this.state.status === 'stopped' ? this.state.filesRemaining > 0 : false;
    this.emit();

    return { removedFromQueue, markedInItems };
  }

  private async processQueue(): Promise<void> {
    while (
      (this.state.status === 'running' || this.state.status === 'paused') &&
      (this.queue.length > 0 || this.active > 0)
    ) {
      while (this.state.status === 'paused' && this.abortController) {
        await new Promise((r) => setTimeout(r, 300));
      }
      if (this.state.status !== 'running' && this.state.status !== 'paused') break;

      while (this.active < this.options.maxConcurrent && this.queue.length > 0) {
        const next = this.queue.shift();
        if (!next) break;
        this.active++;
        this.fetchOne(next.url, next.level, next.kind).finally(() => {
          this.active--;
          this.state.filesRemaining = this.queue.length + this.active;
          this.state.resumeAvailable = this.state.status === 'paused' || this.state.status === 'stopped' ? this.state.filesRemaining > 0 : false;
          this.emit();
          this.processQueue();
        });
      }

      if (this.active === 0 && this.queue.length === 0) {
        this.state.status = 'done';
        this.state.stoppedAt = Date.now();
        this.state.resumeAvailable = false;
        this.emit();
        return;
      }

      await new Promise((r) => setTimeout(r, 50));
    }
  }

  private async fetchOne(url: string, level: number, kind: CrawlItem['kind']): Promise<void> {
    const item: CrawlItem = {
      key: `${level}:${kind}:${url}`,
      url,
      progress: 0,
      level,
      kind,
      status: 'queued',
      updatedAt: Date.now(),
    };
    const localPath = getLocalPathForUrl(url, kind, this.state.baseUrl);
    item.localPath = localPath;

    this.state.items.push(item);
    this.emit();

    try {
      await new Promise((r) => setTimeout(r, this.options.delayMs));

      const dedupeKey = this.urlDedupeKey(url);
      if (this.skipped.has(dedupeKey)) {
        item.status = 'skipped';
        item.progress = 100;
        item.updatedAt = Date.now();
        this.emit();
        return;
      }

      if (kind === 'page') {
        // 对 HTML：先浏览器渲染（跑 JS），再离线重写 HTML/CSS 入口链接。
        const renderResult = await this.getBrowserRenderer().renderPage(url);
        item.contentType = renderResult.htmlContentType ?? 'text/html; charset=utf-8';
        item.status = 'rendering';
        item.progress = 0;
        item.updatedAt = Date.now();
        this.emit();

        const rewritten = rewriteHtmlDocument({
          html: renderResult.html,
          pageUrl: renderResult.finalUrl,
          pageLocalPath: localPath,
          baseUrl: this.state.baseUrl,
          sameSitePagesOnly: this.options.sameSitePagesOnly,
        });

        item.progress = 100;
        item.status = 'done';
        item.updatedAt = Date.now();
        this.emit();

        this.state.filesDownloaded++;
        this.state.pagesDiscovered++;
        if (rewritten.degradedReasons.length > 0) {
          this.state.degradedPages++;
          this.state.warnings = Array.from(new Set([...(this.state.warnings ?? []), ...rewritten.degradedReasons]));
        }

        // 保存“改写后的 HTML”，离线预览才会使用本地资源。
        this.downloaded.set(localPath, {
          contentType: item.contentType,
          body: rewritten.html,
          url,
        });

        // 队列策略：
        // - 页面：只在 level < maxDepth 时继续发现下一层页面
        // - 资源：无论 level 是否达到上限，都应下载以保证离线可用
        const shouldDiscoverPages = level < this.options.maxDepth;

        if (shouldDiscoverPages) {
          for (const ref of rewritten.pageRefs) {
            if (this.options.sameSitePagesOnly && !isSameOrigin(ref.absoluteUrl, this.state.baseUrl)) continue;
            const key = this.urlDedupeKey(ref.absoluteUrl);
            if (this.skipped.has(key)) continue;
            if (this.seen.has(key)) continue;
            this.seen.add(key);
            this.queue.push({ url: ref.absoluteUrl, level: level + 1, kind: 'page' });
          }
        }

        for (const ref of rewritten.assetRefs) {
          if (this.options.sameSitePagesOnly && !isSameOrigin(ref.absoluteUrl, this.state.baseUrl)) continue;
          const key = this.urlDedupeKey(ref.absoluteUrl);
          if (this.skipped.has(key)) continue;
          if (this.seen.has(key)) continue;
          this.seen.add(key);
          this.queue.push({ url: ref.absoluteUrl, level: level + 1, kind: 'asset' });
        }
      } else {
        // 对非 HTML 资源：按 content-type 判断是否 CSS，并做 CSS 内 url() 的离线改写。
        const res = await fetch(url, {
          signal: this.abortController?.signal,
          headers: { 'User-Agent': 'LuminaOctopus/1.0' },
        });

        if (!res.ok) {
          item.status = 'error';
          item.error = `${res.status}`;
          item.updatedAt = Date.now();
          this.state.errors++;
          this.state.lastError = item.error;
          this.emit();
          return;
        }

        const contentType = res.headers.get('content-type') || 'application/octet-stream';
        item.contentType = contentType;
        item.status = 'downloading';
        item.progress = 0;
        item.updatedAt = Date.now();
        this.emit();

        const urlLower = url.toLowerCase();
        const isCss = contentType.includes('text/css') || urlLower.endsWith('.css');

        let body: string | Buffer;
        if (isCss) {
          const cssText = await res.text();
          const rewrittenCss = rewriteCssText({
            cssText,
            cssUrl: url,
            cssLocalPath: localPath,
            baseUrl: this.state.baseUrl,
          });
          body = rewrittenCss.cssText;

          // 下载 CSS 之后，再继续下载 CSS 里引用的图片/字体等资源。
          for (const ref of rewrittenCss.assetRefs) {
            if (this.options.sameSitePagesOnly && !isSameOrigin(ref.absoluteUrl, this.state.baseUrl)) continue;
            const key = this.urlDedupeKey(ref.absoluteUrl);
            if (this.skipped.has(key)) continue;
            if (this.seen.has(key)) continue;
            this.seen.add(key);
            this.queue.push({ url: ref.absoluteUrl, level: level + 1, kind: 'asset' });
          }
        } else {
          body = Buffer.from(await res.arrayBuffer());
        }

        item.progress = 100;
        item.status = 'done';
        item.updatedAt = Date.now();
        this.emit();

        this.state.filesDownloaded++;
        this.state.assetsDownloaded++;

        this.downloaded.set(localPath, {
          contentType,
          body,
          url,
        });
      }
    } catch (e) {
      const err = e instanceof Error ? e.message : String(e);
      if (err.includes('abort')) return;
      item.status = 'error';
      item.error = err;
      item.updatedAt = Date.now();
      this.state.errors++;
      this.state.lastError = err;
    } finally {
      this.state.filesRemaining = this.queue.length + this.active;
      this.state.resumeAvailable =
        this.state.status === 'paused' || this.state.status === 'stopped' ? this.state.filesRemaining > 0 : false;
      this.emit();
    }
  }
}

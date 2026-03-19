/**
 * 爬虫相关类型（纯 TypeScript，无 Next/React 依赖，便于 Electron 复用）
 *
 * 注意：前端 `app/page.tsx` 对 `CrawlState/CrawlItem/LogEntry` 有明确字段期望；
 * 这里需要保持一致，否则就会出现统计为 0、日志/历史无法回显等问题。
 */

export type CrawlStatus = 'idle' | 'running' | 'paused' | 'stopped' | 'done' | 'error';

export type CrawlItemStatus = 'queued' | 'downloading' | 'writing' | 'rendering' | 'done' | 'error' | 'skipped';

export type QueueKind = 'page' | 'asset';

export type DiscoverSource =
  | 'anchor'
  | 'iframe'
  | 'script'
  | 'image'
  | 'media'
  | 'other'
  | 'manifest'
  | 'icon'
  | 'modulepreload'
  | 'preload'
  | 'stylesheet'
  | 'style-import'
  | 'style-url';

export interface DiscoveredRef {
  url: string;
  absoluteUrl: string;
  source: DiscoverSource;
  tagName: string;
  attribute: string;
  rel?: string;
}

export interface RobotsMatcher {
  sourceUrl: string;
  allows: (url: string) => boolean;
}

export interface BrowserResponseRecord {
  url: string;
  resourceType: string;
  status: number;
  contentType?: string;
}

export interface RenderPageResult {
  requestedUrl: string;
  finalUrl: string;
  html: string;
  htmlContentType: string;
  networkRecords: BrowserResponseRecord[];
}

export interface ManifestEntry {
  // 当前 MVP 只做结构占位；如后续引入 offline rewrite，可扩展字段
  url: string;
  localPath: string;
  contentType?: string;
  bytes?: number;
  degraded?: boolean;
}

export interface LogEntry {
  timestamp: number;
  jobId: string;
  level: 'info' | 'warn' | 'error';
  event: string;
  message: string;
  url?: string;
  // 允许附带调试字段（前端不会使用但便于排查）
  details?: Record<string, unknown>;
}

export interface CrawlItem {
  key: string;
  url: string;
  normalizedUrl?: string;
  status: CrawlItemStatus;
  progress: number;
  level: number;
  kind: QueueKind;
  localPath?: string;
  contentType?: string;
  sourcePage?: string;
  discoveredFrom?: string;
  error?: string;
  updatedAt: number;
}

export interface CrawlState {
  status: CrawlStatus;
  jobId: string;
  outputPath: string;
  renderMode: 'browser';

  baseUrl: string;
  maxDepth: number;
  maxConcurrent: number;
  sameSitePagesOnly: boolean;
  delayMs: number;
  respectRobots: boolean;

  filesDownloaded: number;
  filesRemaining: number;
  pagesDiscovered: number;
  assetsDownloaded: number;
  degradedPages: number;
  errors: number;
  warnings?: string[];
  lastError?: string;

  // front-end 展示用的队列条目（此处不强制保证和内部队列完全一致）
  items: CrawlItem[];

  queue?: unknown[];
  inFlight?: unknown[];
  resumeAvailable?: boolean;

  startedAt?: number;
  stoppedAt?: number;
  lastUpdatedAt: number;
}

export interface CrawlOptions {
  baseUrl: string;

  // 与 front-end UI 对齐：maxDepth
  maxDepth?: number;
  // 兼容旧字段
  maxLevel?: number;

  maxConcurrent?: number;
  sameSitePagesOnly?: boolean;
  respectRobots?: boolean;
  delayMs?: number;

  // 持久化与 UI 展示字段
  jobId?: string;
  outputPath?: string;

  renderMode?: 'browser';
  // outputRoot 主要用于后端写盘计算路径；前端不需要
  outputRoot?: string;

  // 兼容旧引擎参数：sameOriginOnly
  sameOriginOnly?: boolean;
}

export interface JobSummary {
  jobId: string;
  status: CrawlStatus;
  baseUrl: string;
  outputPath: string;
  startedAt?: number;
  stoppedAt?: number;
  filesDownloaded: number;
  pagesDiscovered: number;
  assetsDownloaded: number;
  degradedPages: number;
  errors: number;
  lastError?: string;
  warnings?: string[];
}

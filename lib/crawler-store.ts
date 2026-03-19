/**
 * 单例爬虫状态存储，供 Next API 与前端轮询使用。
 * 后续 Electron 可改为 main 进程内单例，通过 IPC 与渲染进程通信。
 */

import { CrawlEngine } from './crawler';
import type { CrawlOptions, CrawlState } from './crawler';
import { JobManager } from './crawler/job-manager';
import { appendLog, getJobPaths, writeJobState, writeOutputFile } from './crawler/job-store';
import type { JobPaths } from './crawler/job-store';

type GlobalCrawlerStore = {
  engine: CrawlEngine | null;
  lastState: CrawlState | null;
  jobManager: JobManager | null;
  currentJobPaths: JobPaths | null;
  writtenOutputPaths: Set<string>;
  lastJobStateWriteAt: number;
  persistChain: Promise<void>;
  jobGeneration: number;
};

function getGlobalStore(): GlobalCrawlerStore {
  const globalAny = globalThis as any;
  if (!globalAny.__luminaCrawlerStore) {
    globalAny.__luminaCrawlerStore = {
      engine: null,
      lastState: null,
      jobManager: null,
      currentJobPaths: null,
      writtenOutputPaths: new Set<string>(),
      lastJobStateWriteAt: 0,
      persistChain: Promise.resolve(),
      jobGeneration: 0,
    } satisfies GlobalCrawlerStore;
  }
  return globalAny.__luminaCrawlerStore as GlobalCrawlerStore;
}

// 注意：notify 不建议作为全局函数使用（会受 job 切换影响）。

export function getCrawlerState(): CrawlState | null {
  const store = getGlobalStore();
  return store.lastState ?? store.engine?.getState() ?? null;
}

function isHtmlContentType(contentType: string | undefined): boolean {
  if (!contentType) return false;
  const lowered = contentType.toLowerCase();
  return lowered.includes('text/html') || lowered.includes('application/xhtml+xml');
}

async function persistStateAndOutputs(params: {
  engineInstance: CrawlEngine;
  jobPaths: JobPaths;
  writtenSet: Set<string>;
  state: CrawlState;
}): Promise<void> {
  const { engineInstance, jobPaths, writtenSet, state } = params;
  const store = getGlobalStore();
  // 写入新下载到的文件（按已写盘去重）
  const downloaded = engineInstance.getDownloaded();
  for (const [localPath, { contentType, body, url }] of Array.from(downloaded.entries())) {
    if (writtenSet.has(localPath)) continue;
    await writeOutputFile(jobPaths, localPath, body);
    writtenSet.add(localPath);

    const html = isHtmlContentType(contentType);
    const event = html ? 'page_saved' : 'asset_saved';
    const message = html ? `Saved page snapshot to ${localPath}` : `Saved asset to ${localPath}`;
    await appendLog(jobPaths, {
      timestamp: Date.now(),
      jobId: state.jobId,
      level: 'info',
      event,
      message,
      url,
      details: html
        ? { contentType }
        : {
            contentType,
            bytes: typeof body === 'string' ? body.length : body.byteLength,
          },
    });
  }

  // 写入任务状态（节流 + 关键状态强制落盘）
  const now = Date.now();
  const shouldForce = state.status === 'done' || state.status === 'error' || state.status === 'stopped' || state.status === 'paused';
  const shouldWrite = store.lastJobStateWriteAt === 0 || shouldForce || now - store.lastJobStateWriteAt > 1000;
  if (!shouldWrite) return;
  store.lastJobStateWriteAt = now;
  await writeJobState(jobPaths, state);
}

function schedulePersist(params: {
  generation: number;
  engineInstance: CrawlEngine;
  jobPaths: JobPaths;
  writtenSet: Set<string>;
  state: CrawlState;
}): Promise<void> {
  const store = getGlobalStore();
  // 串行化磁盘写入，避免频繁状态轮询导致并发写盘冲突
  store.persistChain = store.persistChain
    .then(() => {
      if (params.generation !== store.jobGeneration) return;
      return persistStateAndOutputs(params);
    })
    .catch((e) => {
      console.error('Failed to persist crawl job state/logs/outputs', e);
    });
  return store.persistChain;
}

export function createOrGetEngine(options: CrawlOptions): CrawlEngine {
  const store = getGlobalStore();
  if (store.engine) {
    store.engine.stop();
    store.engine = null;
  }
  store.currentJobPaths = null;
  store.writtenOutputPaths = new Set();
  store.lastJobStateWriteAt = 0;
  store.jobGeneration += 1;
  store.persistChain = Promise.resolve();

  const outputRoot = options.outputRoot ?? 'jobs';
  const jobId = options.jobId ?? 'local';
  const jobPaths = getJobPaths(jobId, outputRoot);
  store.currentJobPaths = jobPaths;

  const writtenSet = new Set<string>();
  store.writtenOutputPaths = writtenSet;

  const generation = store.jobGeneration;
  const localEngine = new CrawlEngine(options, (state) => {
    store.lastState = state;
    void schedulePersist({ generation, engineInstance: localEngine, jobPaths, writtenSet, state });
  });

  store.engine = localEngine;
  store.lastState = localEngine.getState();
  return localEngine;
}

export function getEngine(): CrawlEngine | null {
  return getGlobalStore().engine;
}

export function stopCrawler(): void {
  getGlobalStore().engine?.stop();
}

export function pauseCrawler(): void {
  getGlobalStore().engine?.pause();
}

export function resumeCrawler(): void {
  getGlobalStore().engine?.resume();
}

/**
 * Jobs/Logs endpoints rely on a separate on-disk JobManager.
 * Keep it as a singleton so polling routes share recovery state.
 */
export function getJobManager(): JobManager {
  const store = getGlobalStore();
  if (!store.jobManager) store.jobManager = new JobManager();
  return store.jobManager;
}

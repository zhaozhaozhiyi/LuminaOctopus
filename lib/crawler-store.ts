/**
 * 单例爬虫状态存储，供 Next API 与前端轮询使用。
 * 后续 Electron 可改为 main 进程内单例，通过 IPC 与渲染进程通信。
 */

import { CrawlEngine } from './crawler';
import type { CrawlOptions, CrawlState } from './crawler';
import { JobManager } from './crawler/job-manager';
import { appendLog, getJobPaths, writeJobState, writeOutputFile } from './crawler/job-store';
import type { JobPaths } from './crawler/job-store';

let engine: CrawlEngine | null = null;
let lastState: CrawlState | null = null;
let jobManager: JobManager | null = null;
let currentJobPaths: JobPaths | null = null;
let writtenOutputPaths: Set<string> = new Set();
let lastJobStateWriteAt = 0;
let persistChain: Promise<void> = Promise.resolve();
let jobGeneration = 0;

// 注意：notify 不建议作为全局函数使用（会受 job 切换影响）。

export function getCrawlerState(): CrawlState | null {
  return lastState ?? engine?.getState() ?? null;
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
  const shouldWrite = lastJobStateWriteAt === 0 || shouldForce || now - lastJobStateWriteAt > 1000;
  if (!shouldWrite) return;
  lastJobStateWriteAt = now;
  await writeJobState(jobPaths, state);
}

function schedulePersist(params: {
  generation: number;
  engineInstance: CrawlEngine;
  jobPaths: JobPaths;
  writtenSet: Set<string>;
  state: CrawlState;
}): Promise<void> {
  // 串行化磁盘写入，避免频繁状态轮询导致并发写盘冲突
  persistChain = persistChain
    .then(() => {
      if (params.generation !== jobGeneration) return;
      return persistStateAndOutputs(params);
    })
    .catch((e) => {
      console.error('Failed to persist crawl job state/logs/outputs', e);
    });
  return persistChain;
}

export function createOrGetEngine(options: CrawlOptions): CrawlEngine {
  if (engine) {
    engine.stop();
    engine = null;
  }
  currentJobPaths = null;
  writtenOutputPaths = new Set();
  lastJobStateWriteAt = 0;
  jobGeneration += 1;
  persistChain = Promise.resolve();

  const outputRoot = options.outputRoot ?? 'jobs';
  const jobId = options.jobId ?? 'local';
  const jobPaths = getJobPaths(jobId, outputRoot);
  currentJobPaths = jobPaths;

  const writtenSet = new Set<string>();
  writtenOutputPaths = writtenSet;

  const generation = jobGeneration;
  const localEngine = new CrawlEngine(options, (state) => {
    lastState = state;
    void schedulePersist({ generation, engineInstance: localEngine, jobPaths, writtenSet, state });
  });

  engine = localEngine;
  lastState = localEngine.getState();
  return localEngine;
}

export function getEngine(): CrawlEngine | null {
  return engine;
}

export function stopCrawler(): void {
  engine?.stop();
}

export function pauseCrawler(): void {
  engine?.pause();
}

export function resumeCrawler(): void {
  engine?.resume();
}

/**
 * Jobs/Logs endpoints rely on a separate on-disk JobManager.
 * Keep it as a singleton so polling routes share recovery state.
 */
export function getJobManager(): JobManager {
  if (!jobManager) jobManager = new JobManager();
  return jobManager;
}

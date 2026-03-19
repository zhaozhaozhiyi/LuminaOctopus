import { randomUUID } from 'node:crypto';
import { getJobPaths, listJobs, readJobState, readLogs, readManifest, type JobPaths, writeJobState } from './job-store';
import { CrawlEngine } from './engine';
import type { CrawlOptions, CrawlState, JobSummary } from './types';

function isActiveStatus(status: CrawlState['status']): boolean {
  return status === 'running' || status === 'paused';
}

export class JobManager {
  private activeJobId: string | null = null;
  private activeEngine: CrawlEngine | null = null;
  private outputRoot: string;
  private readyPromise: Promise<void>;

  constructor(outputRoot = 'jobs') {
    this.outputRoot = outputRoot;
    this.readyPromise = this.recoverJobs();
  }

  async ready(): Promise<void> {
    await this.readyPromise;
  }

  private async recoverJobs(): Promise<void> {
    // Recovery must never crash API polling. If a saved job entry is
    // partially corrupt or from an older schema, we just skip it.
    try {
      const jobs = await listJobs(this.outputRoot);
      for (const summary of jobs) {
        try {
          const state = await readJobState(summary.jobId, this.outputRoot);
          if (!state) continue;

          if (state.status === 'running' || state.status === 'paused') {
            const lastUpdatedAt = (state as any).lastUpdatedAt;
            const likelyAlive =
              typeof lastUpdatedAt === 'number' && Date.now() - lastUpdatedAt < 8000 /* last persist likely within 1-8s */;
            if (likelyAlive) continue;

            const jobId = (state as any).jobId ?? summary.jobId;
            const queue = Array.isArray((state as any).queue) ? (state as any).queue : [];
            const inFlight = Array.isArray((state as any).inFlight) ? (state as any).inFlight : [];
            const warnings = Array.isArray((state as any).warnings) ? (state as any).warnings : [];

            state.status = 'stopped';
            (state as any).stoppedAt = Date.now();
            (state as any).resumeAvailable = queue.length > 0 || inFlight.length > 0;
            (state as any).warnings = Array.from(
              new Set([
                ...warnings,
                'Recovered after a process restart. Resume the job to continue.',
              ]),
            );

            await writeJobState(getJobPaths(jobId, this.outputRoot), state);
          }
        } catch (e) {
          console.warn('Failed to recover job', summary.jobId, e);
        }
      }
    } catch (e) {
      console.warn('Failed to recover jobs', e);
    }
  }

  async startJob(options: CrawlOptions): Promise<{ jobId: string; outputPath: string; state: CrawlState }> {
    await this.ready();
    // 当前版本的启动逻辑由 `crawler-store` + `/api/crawl/start` 负责。
    // JobManager 仅保留历史/日志的磁盘读取能力（listJobs/readLogs）。
    throw new Error('JobManager.startJob is not wired in this build. Use /api/crawl/start instead.');
  }

  async getJobState(jobId: string): Promise<CrawlState | null> {
    await this.ready();
    if (this.activeJobId === jobId && this.activeEngine) {
      return this.activeEngine.getState();
    }
    return readJobState(jobId, this.outputRoot);
  }

  async pauseJob(jobId: string): Promise<CrawlState | null> {
    await this.ready();
    // 暂不接入暂停（当前由 /api/crawl/pause 走单例引擎）。
    throw new Error('JobManager.pauseJob is not wired in this build. Use /api/crawl/pause instead.');
  }

  async resumeJob(jobId: string): Promise<CrawlState | null> {
    await this.ready();
    // 暂不接入恢复（当前由 /api/crawl/resume 走单例引擎）。
    throw new Error('JobManager.resumeJob is not wired in this build. Use /api/crawl/resume instead.');
  }

  async stopJob(jobId: string): Promise<CrawlState | null> {
    await this.ready();
    // 暂不接入停止（当前由 /api/crawl/stop 走单例引擎）。
    throw new Error('JobManager.stopJob is not wired in this build. Use /api/crawl/stop instead.');
  }

  async listJobs(): Promise<JobSummary[]> {
    await this.ready();
    return listJobs(this.outputRoot);
  }

  async readLogs(jobId: string, limit = 200) {
    await this.ready();
    return readLogs(jobId, limit, this.outputRoot);
  }

  getPaths(jobId: string): JobPaths {
    return getJobPaths(jobId, this.outputRoot);
  }
}

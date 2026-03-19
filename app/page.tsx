'use client';

import { startTransition, useEffect, useMemo, useState } from 'react';

type CrawlStatus = 'idle' | 'running' | 'paused' | 'stopped' | 'done' | 'error';
type ItemStatus = 'queued' | 'rendering' | 'downloading' | 'writing' | 'done' | 'error' | 'skipped';
type QueueKind = 'page' | 'asset';

interface CrawlItem {
  key: string;
  url: string;
  normalizedUrl: string;
  status: ItemStatus;
  progress: number;
  level: number;
  kind: QueueKind;
  localPath?: string;
  contentType?: string;
  sourcePage?: string;
  discoveredFrom: string;
  error?: string;
  updatedAt: number;
}

interface CrawlState {
  jobId: string;
  status: CrawlStatus;
  baseUrl: string;
  outputPath: string;
  renderMode: 'browser';
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
  items: CrawlItem[];
  startedAt?: number;
  stoppedAt?: number;
  lastUpdatedAt: number;
  resumeAvailable: boolean;
}

interface JobSummary {
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

interface LogEntry {
  timestamp: number;
  jobId: string;
  level: 'info' | 'warn' | 'error';
  event: string;
  message: string;
  url?: string;
}

const STATUS_POLL_MS = 1500;
const JOB_POLL_MS = 4500;

function formatTime(timestamp?: number): string {
  if (!timestamp) return '-';
  return new Date(timestamp).toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

async function readJson<T>(response: Response): Promise<T> {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(typeof data?.error === 'string' ? data.error : `Request failed with ${response.status}`);
  }
  return data as T;
}

function triggerDownload(url: string): void {
  const link = document.createElement('a');
  link.href = url;
  link.download = '';
  link.rel = 'noopener';
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  window.setTimeout(() => link.remove(), 0);
}

export default function Home() {
  const [url, setUrl] = useState('');
  const [maxDepth, setMaxDepth] = useState(2);
  const [maxConcurrent, setMaxConcurrent] = useState(3);
  const [delayMs, setDelayMs] = useState(200);
  const [respectRobots, setRespectRobots] = useState(true);
  const [jobs, setJobs] = useState<JobSummary[]>([]);
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [state, setState] = useState<CrawlState | null>(null);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);
  const [isLogsModalOpen, setIsLogsModalOpen] = useState(false);

  const activeJob = useMemo(
    () => jobs.find((job) => job.status === 'running' || job.status === 'paused') ?? null,
    [jobs],
  );

  const visibleItems = useMemo(
    () => (state ? [...state.items].sort((left, right) => right.updatedAt - left.updatedAt).slice(0, 160) : []),
    [state],
  );
  const totalItems = state?.items.length ?? 0;

  async function loadJobs(preferredJobId?: string | null) {
    try {
      const data = await readJson<{ items: JobSummary[] }>(await fetch('/api/crawl/jobs', { cache: 'no-store' }));
      startTransition(() => {
        setJobs(data.items);
        const nextSelected =
          preferredJobId ??
          selectedJobId ??
          data.items.find((job) => job.status === 'running' || job.status === 'paused')?.jobId ??
          data.items[0]?.jobId ??
          null;
        setSelectedJobId(nextSelected);
      });
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Failed to load jobs');
    }
  }

  async function loadState(jobId: string) {
    try {
      const nextState = await readJson<CrawlState>(
        await fetch(`/api/crawl/status?jobId=${encodeURIComponent(jobId)}`, { cache: 'no-store' }),
      );
      startTransition(() => setState(nextState));
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Failed to load job state');
    }
  }

  async function loadLogs(jobId: string) {
    try {
      const data = await readJson<{ items: LogEntry[] }>(
        await fetch(`/api/crawl/logs?jobId=${encodeURIComponent(jobId)}&limit=80`, { cache: 'no-store' }),
      );
      startTransition(() => setLogs(data.items.slice().reverse()));
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Failed to load logs');
    }
  }

  useEffect(() => {
    void loadJobs(null);
  }, []);

  useEffect(() => {
    if (!selectedJobId) {
      setState(null);
      setLogs([]);
      return;
    }

    void loadState(selectedJobId);
    void loadLogs(selectedJobId);

    const statusTimer = setInterval(() => {
      void loadState(selectedJobId);
      void loadLogs(selectedJobId);
    }, STATUS_POLL_MS);

    return () => clearInterval(statusTimer);
  }, [selectedJobId]);

  useEffect(() => {
    const jobsTimer = setInterval(() => {
      void loadJobs(selectedJobId);
    }, JOB_POLL_MS);
    return () => clearInterval(jobsTimer);
  }, [selectedJobId]);

  useEffect(() => {
    const anyModalOpen = isHistoryModalOpen || isLogsModalOpen;
    if (!anyModalOpen) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsHistoryModalOpen(false);
        setIsLogsModalOpen(false);
      }
    };

    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKeyDown);

    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [isHistoryModalOpen, isLogsModalOpen]);

  async function startJob() {
    if (!url.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const data = await readJson<{ jobId: string; outputPath: string; state: CrawlState }>(
        await fetch('/api/crawl/start', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            url: url.trim(),
            maxDepth,
            maxConcurrent,
            delayMs,
            respectRobots,
            sameSitePagesOnly: true,
          }),
        }),
      );
      setSelectedJobId(data.jobId);
      setState(data.state);
      await loadJobs(data.jobId);
      await loadLogs(data.jobId);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Failed to start job');
      await loadJobs(selectedJobId);
    } finally {
      setLoading(false);
    }
  }

  async function sendJobAction(endpoint: 'pause' | 'resume' | 'stop') {
    if (!selectedJobId) return;
    setError(null);
    try {
      const nextState = await readJson<CrawlState>(
        await fetch(`/api/crawl/${endpoint}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ jobId: selectedJobId }),
        }),
      );
      setState(nextState);
      await loadJobs(selectedJobId);
      await loadLogs(selectedJobId);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : `Failed to ${endpoint} job`);
    }
  }

  const canStart = Boolean(url.trim()) && !activeJob;
  const canPause = state?.status === 'running';
  const canResume = Boolean(selectedJobId) && (state?.status === 'paused' || state?.status === 'stopped') && state.resumeAvailable;
  const canStop = state?.status === 'running' || state?.status === 'paused';
  const canExport = Boolean(selectedJobId) && (state?.filesDownloaded ?? 0) > 0 && state?.status !== 'running';

  return (
    <main className="shell">
      <section className="hero">
        <div>
          <p className="eyebrow">Lumina Octopus</p>
          <h1>完整整站镜像工作台</h1>
          <p className="subtitle">
            以浏览器渲染快照为核心，镜像公开站点的页面与资源，并把输出稳定落盘到本地目录。
          </p>
        </div>
      </section>

      {error && <section className="banner error-banner">{error}</section>}
      {activeJob && !canStart && (
        <section className="banner info-banner">
          当前有活动任务 `{activeJob.jobId}`，完成、暂停或停止后才能新建任务。
        </section>
      )}

      <section className="panel controls">
        <div className="controls-head">
          <div>
            <h2>新建镜像任务</h2>
            <p>输入站点入口 URL，系统会按层级抓页面，自动下载外链静态资源，并把镜像写入 `jobs/&lt;jobId&gt;/site`。</p>
          </div>
          <div className="button-row">
            <button onClick={startJob} disabled={!canStart || loading} className="btn btn-primary">
              {loading ? '启动中...' : '开始镜像'}
            </button>
            <button onClick={() => void sendJobAction('pause')} disabled={!canPause} className="btn btn-secondary">
              暂停
            </button>
            <button onClick={() => void sendJobAction('resume')} disabled={!canResume} className="btn btn-secondary">
              恢复
            </button>
            <button onClick={() => void sendJobAction('stop')} disabled={!canStop} className="btn btn-secondary">
              停止
            </button>
            <button
              onClick={() => {
                if (!selectedJobId) return;
                setError(null);
                triggerDownload(`/api/crawl/export?jobId=${encodeURIComponent(selectedJobId)}`);
              }}
              disabled={!canExport}
              className="btn btn-ghost"
            >
              导出 Zip
            </button>
          </div>
        </div>

        <div className="form-grid">
          <label className="field field-wide">
            <span>入口 URL</span>
            <input
              type="url"
              value={url}
              onChange={(event) => setUrl(event.target.value)}
              placeholder="https://example.com"
            />
          </label>

          <label className="field">
            <span>最大层级</span>
            <select value={maxDepth} onChange={(event) => setMaxDepth(Number(event.target.value))}>
              {[0, 1, 2, 3, 4, 5].map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </label>

          <label className="field">
            <span>并发数</span>
            <input
              type="number"
              min={1}
              max={6}
              value={maxConcurrent}
              onChange={(event) => setMaxConcurrent(Number(event.target.value))}
            />
          </label>

          <label className="field">
            <span>请求延迟 (ms)</span>
            <input
              type="number"
              min={0}
              max={5000}
              step={50}
              value={delayMs}
              onChange={(event) => setDelayMs(Number(event.target.value))}
            />
          </label>

          <label className="toggle">
            <input
              type="checkbox"
              checked={respectRobots}
              onChange={(event) => setRespectRobots(event.target.checked)}
            />
            <span>默认遵守 robots.txt</span>
          </label>
        </div>
      </section>

      <section className="summary-grid">
        <article className="summary-card">
          <span className="summary-label">任务状态</span>
          <strong>{state?.status ?? 'idle'}</strong>
          <small>当前任务 ID: {selectedJobId ?? '-'}</small>
        </article>
        <article className="summary-card">
          <span className="summary-label">镜像输出目录</span>
          <strong>{state?.outputPath ?? '-'}</strong>
          <small>目录是主交付物，Zip 只是额外导出。</small>
        </article>
        <article className="summary-card">
          <span className="summary-label">页面 / 资源</span>
          <strong>
            {state?.pagesDiscovered ?? 0} / {state?.assetsDownloaded ?? 0}
          </strong>
          <small>页面发现数 / 已写入资源数</small>
        </article>
        <article className="summary-card">
          <span className="summary-label">降级 / 错误</span>
          <strong>
            {state?.degradedPages ?? 0} / {state?.errors ?? 0}
          </strong>
          <small>检测到依赖实时 API 的页面会记为降级。</small>
        </article>
      </section>

      <div className="workspace">
        <aside className="sidebar">
          <section className="panel">
            <div className="panel-head">
              <div>
                <h2>任务历史</h2>
                <p>所有任务都落盘在本地，重启后仍可查看和恢复。</p>
              </div>
              <div className="panel-meta">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setIsHistoryModalOpen(true)}
                  disabled={jobs.length === 0}
                >
                  {jobs.length === 0 ? '暂无任务' : `查看（${jobs.length}）`}
                </button>
              </div>
            </div>
          </section>

          <section className="panel">
            <div className="panel-head">
              <div>
                <h2>最近日志</h2>
                <p>渲染、资源写入、告警和错误都会持续追加到任务日志。</p>
              </div>
              <div className="panel-meta">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setIsLogsModalOpen(true)}
                  disabled={!selectedJobId}
                >
                  {selectedJobId ? '打开日志' : '先选择任务'}
                </button>
              </div>
            </div>
          </section>
        </aside>

        <section className="main-column">
          <section className="panel">
            <div className="panel-head">
              <div>
                <h2>任务概览</h2>
                <p>这里汇总当前任务的输出位置、运行时间、策略和最近告警。</p>
              </div>
            </div>
            <div className="details-grid">
              <div className="detail-row">
                <span>入口站点</span>
                <code>{state?.baseUrl ?? '-'}</code>
              </div>
              <div className="detail-row">
                <span>启动时间</span>
                <strong>{formatTime(state?.startedAt)}</strong>
              </div>
              <div className="detail-row">
                <span>最近更新时间</span>
                <strong>{formatTime(state?.lastUpdatedAt)}</strong>
              </div>
              <div className="detail-row">
                <span>层级 / 并发 / 延迟</span>
                <strong>
                  {state?.maxDepth ?? '-'} / {state?.maxConcurrent ?? '-'} / {state?.delayMs ?? '-'}
                </strong>
              </div>
              <div className="detail-row">
                <span>已下载 / 剩余</span>
                <strong>
                  {state?.filesDownloaded ?? 0} / {state?.filesRemaining ?? 0}
                </strong>
              </div>
              <div className="detail-row">
                <span>robots / 页面边界</span>
                <strong>
                  {state?.respectRobots ? '遵守' : '忽略'} / {state?.sameSitePagesOnly ? '站内页面' : '跨站页面'}
                </strong>
              </div>
            </div>

            {((state?.warnings?.length ?? 0) > 0 || Boolean(state?.lastError)) ? (
              <div className="warning-box">
                {state?.lastError && <p>最近错误: {state.lastError}</p>}
                {(state?.warnings ?? []).map((warning, index) => (
                  <p key={`${warning}-${index}`}>{warning}</p>
                ))}
              </div>
            ) : (
              <p className="empty">当前任务暂无额外告警。</p>
            )}
          </section>

          <section className="panel queue-panel">
            <div className="panel-head">
              <div>
                <h2>镜像队列</h2>
                <p>展示最近处理过的页面和资源。页面会走浏览器渲染，资源会二进制安全地写入本地目录。</p>
              </div>
              <div className="panel-meta">
                <span>已显示 {visibleItems.length}</span>
                <span>总计 {totalItems}</span>
              </div>
            </div>

            {visibleItems.length === 0 ? (
              <p className="empty">任务开始后，这里会出现页面和资源处理记录。</p>
            ) : (
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>状态</th>
                      <th>类型</th>
                      <th>URL / 本地路径</th>
                      <th>进度</th>
                      <th>层级</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleItems.map((item, index) => (
                      <tr
                        key={
                          item.key ??
                          `${item.kind}:${item.normalizedUrl ?? item.url}:${item.level}:${index}`
                        }
                      >
                        <td>
                          <span className={`badge badge-${item.status}`}>{item.status}</span>
                          {item.error && <span className="row-error">{item.error}</span>}
                        </td>
                        <td>{item.kind}</td>
                        <td className="url-cell">
                          <div>{item.localPath ?? item.url}</div>
                          {item.localPath && <small>{item.url}</small>}
                        </td>
                        <td>{item.progress}%</td>
                        <td>{item.level}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </section>
      </div>

      {isHistoryModalOpen && (
        <div
          className="modal-overlay"
          role="dialog"
          aria-modal="true"
          aria-label="任务历史"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setIsHistoryModalOpen(false);
          }}
        >
          <div className="modal">
            <div className="modal-head">
              <div>
                <h2>任务历史</h2>
                <p>选择任务后将自动更新主面板状态，并可在“最近日志”查看详细记录。</p>
              </div>
              <button type="button" className="btn btn-ghost modal-close" onClick={() => setIsHistoryModalOpen(false)}>
                关闭
              </button>
            </div>
            <div className="modal-body">
              <div className="history-list">
                {jobs.length === 0 && <p className="empty">还没有任务，先启动一个公开站点镜像。</p>}
                {jobs.map((job) => (
                  <button
                    key={job.jobId}
                    type="button"
                    className={`history-card ${selectedJobId === job.jobId ? 'active' : ''}`}
                    onClick={() => {
                      setSelectedJobId(job.jobId);
                      setIsHistoryModalOpen(false);
                    }}
                  >
                    <div className="history-top">
                      <span className={`badge badge-${job.status}`}>{job.status}</span>
                      <span className="history-time">{formatTime(job.startedAt)}</span>
                    </div>
                    <strong>{job.baseUrl}</strong>
                    <small>{job.jobId}</small>
                    <div className="history-metrics">
                      <span>文件 {job.filesDownloaded}</span>
                      <span>降级 {job.degradedPages}</span>
                      <span>错误 {job.errors}</span>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {isLogsModalOpen && (
        <div
          className="modal-overlay"
          role="dialog"
          aria-modal="true"
          aria-label="最近日志"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setIsLogsModalOpen(false);
          }}
        >
          <div className="modal">
            <div className="modal-head">
              <div>
                <h2>最近日志</h2>
                <p>
                  任务 ID：<code style={{ color: 'inherit' }}>{selectedJobId ?? '-'}</code>（自动刷新中）
                </p>
              </div>
              <button type="button" className="btn btn-ghost modal-close" onClick={() => setIsLogsModalOpen(false)}>
                关闭
              </button>
            </div>
            <div className="modal-body">
              <div className="log-list">
                {logs.length === 0 && <p className="empty">选择任务后显示最近日志。</p>}
                {logs.map((entry, index) => (
                  <article key={`${entry.timestamp}-${index}`} className={`log-entry log-${entry.level}`}>
                    <div className="log-meta">
                      <span>{entry.level}</span>
                      <span>{formatTime(entry.timestamp)}</span>
                    </div>
                    <strong>{entry.event}</strong>
                    <p>{entry.message}</p>
                    {entry.url && <code>{entry.url}</code>}
                  </article>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      <style jsx>{`
        .shell {
          min-height: 100vh;
          height: 100vh;
          display: flex;
          flex-direction: column;
          gap: 0.85rem;
          padding: 1rem 1.15rem 1.15rem;
          overflow: hidden;
          background:
            radial-gradient(circle at top left, rgba(83, 164, 217, 0.18), transparent 28%),
            radial-gradient(circle at top right, rgba(255, 177, 101, 0.14), transparent 24%),
            linear-gradient(180deg, #08131a 0%, #0d1720 48%, #0d1318 100%);
        }
        .hero,
        .panel,
        .banner {
          max-width: 1380px;
          width: 100%;
          margin: 0 auto;
        }
        .hero {
          display: grid;
          grid-template-columns: minmax(0, 1.2fr) minmax(300px, 0.8fr);
          gap: 0.9rem;
          padding: 1.1rem 1.25rem;
          border: 1px solid rgba(130, 191, 224, 0.18);
          border-radius: 24px;
          background: linear-gradient(135deg, rgba(8, 27, 38, 0.86), rgba(17, 28, 36, 0.92));
          box-shadow: 0 30px 100px rgba(0, 0, 0, 0.28);
        }
        .eyebrow {
          margin: 0 0 0.35rem;
          font-size: 0.78rem;
          letter-spacing: 0.2em;
          text-transform: uppercase;
          color: #87d8ff;
        }
        h1 {
          margin: 0;
          font-size: clamp(1.85rem, 3.2vw, 2.9rem);
          line-height: 1;
          letter-spacing: -0.05em;
        }
        .subtitle {
          margin: 0.65rem 0 0;
          max-width: 58ch;
          color: rgba(218, 232, 240, 0.76);
          line-height: 1.5;
        }
        .hero-meta {
          display: grid;
          gap: 0.6rem;
          align-content: start;
        }
        .hero-meta span {
          padding: 0.72rem 0.88rem;
          border: 1px solid rgba(135, 216, 255, 0.16);
          border-radius: 16px;
          background: rgba(255, 255, 255, 0.04);
          color: #d6eefb;
        }
        .banner {
          padding: 0.9rem 1rem;
          border-radius: 16px;
          border: 1px solid transparent;
        }
        .error-banner {
          background: rgba(255, 105, 105, 0.12);
          border-color: rgba(255, 105, 105, 0.28);
          color: #ffd5d5;
        }
        .info-banner {
          background: rgba(135, 216, 255, 0.1);
          border-color: rgba(135, 216, 255, 0.22);
          color: #d4effb;
        }
        .panel {
          padding: 1rem;
          border-radius: 22px;
          border: 1px solid rgba(141, 179, 204, 0.18);
          background: rgba(10, 20, 27, 0.78);
          backdrop-filter: blur(16px);
          box-shadow: 0 12px 40px rgba(0, 0, 0, 0.18);
        }
        .controls-head,
        .panel-head {
          display: flex;
          justify-content: space-between;
          gap: 1rem;
          align-items: flex-start;
          margin-bottom: 0.8rem;
        }
        h2 {
          margin: 0 0 0.2rem;
          font-size: 1rem;
        }
        .panel p,
        .panel-head p {
          margin: 0;
          color: rgba(214, 230, 239, 0.72);
          line-height: 1.45;
        }
        .panel-meta {
          display: inline-flex;
          flex-wrap: wrap;
          gap: 0.45rem;
          justify-content: flex-end;
        }
        .panel-meta span {
          padding: 0.48rem 0.7rem;
          border-radius: 999px;
          border: 1px solid rgba(130, 191, 224, 0.14);
          background: rgba(255, 255, 255, 0.04);
          color: rgba(222, 240, 248, 0.82);
          font-size: 0.77rem;
          letter-spacing: 0.06em;
          text-transform: uppercase;
        }
        .button-row {
          display: flex;
          flex-wrap: wrap;
          gap: 0.55rem;
          justify-content: flex-end;
        }
        .btn {
          border: none;
          border-radius: 999px;
          padding: 0.72rem 1rem;
          font-weight: 700;
          transition: transform 120ms ease, opacity 120ms ease, background 120ms ease;
        }
        .btn:hover:enabled {
          transform: translateY(-1px);
        }
        .btn:disabled {
          opacity: 0.48;
          cursor: not-allowed;
        }
        .btn-primary {
          background: linear-gradient(135deg, #5ed1ff, #1f9dcb);
          color: #042130;
        }
        .btn-secondary {
          background: rgba(217, 238, 247, 0.1);
          color: #e6f6fd;
        }
        .btn-ghost {
          background: rgba(255, 188, 106, 0.14);
          color: #ffd59d;
        }
        .form-grid {
          display: grid;
          grid-template-columns: minmax(0, 1.8fr) repeat(3, minmax(128px, 1fr));
          gap: 0.75rem;
          align-items: end;
        }
        .field {
          display: grid;
          gap: 0.45rem;
        }
        .field-wide {
          grid-column: span 1;
        }
        .field span,
        .toggle span,
        .summary-label {
          color: rgba(206, 226, 237, 0.72);
          font-size: 0.82rem;
          text-transform: uppercase;
          letter-spacing: 0.08em;
        }
        input,
        select {
          width: 100%;
          padding: 0.74rem 0.88rem;
          border-radius: 16px;
          border: 1px solid rgba(130, 191, 224, 0.16);
          background: rgba(255, 255, 255, 0.03);
          color: #f1fbff;
        }
        input:focus,
        select:focus {
          outline: none;
          border-color: rgba(94, 209, 255, 0.72);
          box-shadow: 0 0 0 3px rgba(94, 209, 255, 0.12);
        }
        .toggle {
          display: inline-flex;
          gap: 0.75rem;
          align-items: center;
          padding: 0.72rem 0.88rem;
          border-radius: 16px;
          background: rgba(255, 255, 255, 0.03);
          border: 1px solid rgba(130, 191, 224, 0.16);
        }
        .toggle input {
          width: 18px;
          height: 18px;
          margin: 0;
        }
        .summary-grid {
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: 0.75rem;
          max-width: 1380px;
          width: 100%;
          margin: 0 auto;
        }
        .summary-card {
          width: 100%;
          padding: 0.85rem 0.95rem;
          border-radius: 18px;
          border: 1px solid rgba(130, 191, 224, 0.14);
          background: linear-gradient(180deg, rgba(14, 27, 35, 0.88), rgba(11, 20, 26, 0.94));
        }
        .summary-card strong {
          display: block;
          margin-top: 0.35rem;
          font-size: 1rem;
          line-height: 1.35;
          word-break: break-word;
        }
        .summary-card small {
          display: block;
          margin-top: 0.35rem;
          color: rgba(206, 226, 237, 0.66);
          line-height: 1.4;
        }
        .workspace {
          flex: 1 1 auto;
          min-height: 0;
          max-width: 1380px;
          width: 100%;
          margin: 0 auto;
          display: grid;
          grid-template-columns: 320px minmax(0, 1fr);
          gap: 0.85rem;
        }
        .sidebar,
        .main-column {
          display: grid;
          gap: 0.85rem;
          min-height: 0;
        }
        .sidebar {
          grid-template-rows: minmax(0, 1fr) minmax(0, 1fr);
        }
        .main-column {
          grid-template-rows: auto minmax(0, 1fr);
        }
        .scroll-panel,
        .queue-panel {
          display: flex;
          flex-direction: column;
          min-height: 0;
        }
        .history-list,
        .log-list {
          display: grid;
          gap: 0.65rem;
          flex: 1 1 auto;
          min-height: 0;
          overflow: auto;
          padding-right: 0.1rem;
        }
        .history-card {
          text-align: left;
          padding: 0.85rem;
          border-radius: 16px;
          border: 1px solid rgba(130, 191, 224, 0.14);
          background: rgba(255, 255, 255, 0.02);
          color: inherit;
        }
        .history-card.active {
          border-color: rgba(94, 209, 255, 0.45);
          background: rgba(94, 209, 255, 0.08);
        }
        .history-top,
        .history-metrics,
        .log-meta {
          display: flex;
          justify-content: space-between;
          gap: 0.5rem;
          align-items: center;
        }
        .history-card strong,
        .log-entry strong {
          display: block;
          margin-top: 0.35rem;
          line-height: 1.4;
          word-break: break-word;
        }
        .history-card small,
        .history-time {
          display: block;
          margin-top: 0.25rem;
          color: rgba(206, 226, 237, 0.64);
        }
        .history-metrics {
          margin-top: 0.65rem;
          color: rgba(214, 232, 241, 0.8);
          font-size: 0.85rem;
        }
        .badge {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          padding: 0.25rem 0.62rem;
          border-radius: 999px;
          font-size: 0.75rem;
          text-transform: uppercase;
          letter-spacing: 0.06em;
          background: rgba(148, 163, 184, 0.16);
          color: #d6e7ef;
        }
        .badge-running,
        .badge-rendering,
        .badge-downloading,
        .badge-writing {
          background: rgba(94, 209, 255, 0.14);
          color: #9ce8ff;
        }
        .badge-done {
          background: rgba(71, 187, 143, 0.14);
          color: #94f0c8;
        }
        .badge-paused,
        .badge-stopped,
        .badge-queued {
          background: rgba(255, 188, 106, 0.14);
          color: #ffd59d;
        }
        .badge-error,
        .badge-skipped {
          background: rgba(255, 120, 120, 0.14);
          color: #ffc3c3;
        }
        .log-entry {
          padding: 0.8rem;
          border-radius: 16px;
          background: rgba(255, 255, 255, 0.025);
          border: 1px solid rgba(130, 191, 224, 0.1);
        }
        .log-entry p,
        .log-entry code {
          margin: 0.45rem 0 0;
          word-break: break-word;
        }
        .log-entry code {
          display: block;
          font-size: 0.78rem;
          color: #9ac8db;
        }
        .log-info {
          border-color: rgba(130, 191, 224, 0.14);
        }
        .log-warn {
          border-color: rgba(255, 188, 106, 0.18);
        }
        .log-error {
          border-color: rgba(255, 120, 120, 0.18);
        }
        .details-grid {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 0.75rem;
        }
        .detail-row {
          padding: 0.75rem 0.85rem;
          border-radius: 16px;
          background: rgba(255, 255, 255, 0.03);
          border: 1px solid rgba(130, 191, 224, 0.12);
        }
        .detail-row span {
          display: block;
          font-size: 0.82rem;
          text-transform: uppercase;
          letter-spacing: 0.08em;
          color: rgba(206, 226, 237, 0.64);
        }
        .detail-row strong,
        .detail-row code {
          display: block;
          margin-top: 0.45rem;
          word-break: break-word;
          color: #f2fbff;
        }
        .warning-box {
          margin-top: 0.85rem;
          padding: 0.85rem 0.95rem;
          border-radius: 18px;
          border: 1px solid rgba(255, 188, 106, 0.2);
          background: rgba(255, 188, 106, 0.08);
        }
        .warning-box p {
          margin: 0;
        }
        .warning-box p + p {
          margin-top: 0.45rem;
        }
        .table-wrap {
          flex: 1 1 auto;
          min-height: 0;
          overflow: auto;
          border-radius: 16px;
          border: 1px solid rgba(130, 191, 224, 0.12);
        }
        .table {
          width: 100%;
          border-collapse: collapse;
        }
        .table th,
        .table td {
          padding: 0.72rem 0.85rem;
          border-bottom: 1px solid rgba(130, 191, 224, 0.08);
          vertical-align: top;
        }
        .table th {
          position: sticky;
          top: 0;
          z-index: 1;
          text-align: left;
          font-size: 0.8rem;
          text-transform: uppercase;
          letter-spacing: 0.08em;
          color: rgba(206, 226, 237, 0.66);
          background: rgba(11, 22, 29, 0.96);
          backdrop-filter: blur(12px);
        }
        .url-cell div,
        .url-cell small {
          display: block;
          word-break: break-word;
        }
        .url-cell small {
          margin-top: 0.3rem;
          color: rgba(206, 226, 237, 0.6);
        }
        .row-error {
          display: block;
          margin-top: 0.45rem;
          color: #ffc3c3;
          font-size: 0.83rem;
          line-height: 1.45;
        }
        .empty {
          color: rgba(206, 226, 237, 0.66);
          line-height: 1.45;
        }

        .modal-overlay {
          position: fixed;
          inset: 0;
          z-index: 999;
          background: rgba(0, 0, 0, 0.58);
          backdrop-filter: blur(8px);
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 1.1rem;
        }
        .modal {
          width: min(980px, 100%);
          height: min(78vh, 860px);
          border-radius: 24px;
          border: 1px solid rgba(141, 179, 204, 0.22);
          background: rgba(10, 20, 27, 0.92);
          backdrop-filter: blur(16px);
          box-shadow: 0 35px 120px rgba(0, 0, 0, 0.5);
          overflow: hidden;
          display: flex;
          flex-direction: column;
        }
        .modal-head {
          display: flex;
          justify-content: space-between;
          gap: 1rem;
          align-items: flex-start;
          padding: 1.05rem 1.1rem 0;
        }
        .modal-head p {
          margin-top: 0.25rem;
          color: rgba(214, 230, 239, 0.72);
          line-height: 1.45;
        }
        .modal-body {
          flex: 1 1 auto;
          min-height: 0;
          padding: 0.9rem 1.1rem 1.1rem;
          overflow: auto;
          overscroll-behavior: contain;
        }
        .modal-close {
          padding: 0.6rem 0.95rem;
        }
        @media (max-width: 1100px) {
          .shell {
            height: auto;
            overflow: visible;
          }
          .summary-grid,
          .workspace,
          .hero,
          .form-grid {
            grid-template-columns: 1fr;
          }
          .details-grid {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }
          .workspace,
          .sidebar,
          .main-column {
            min-height: auto;
          }
          .sidebar,
          .main-column {
            grid-template-rows: auto;
          }
          .history-list,
          .log-list,
          .table-wrap {
            max-height: 360px;
          }
        }
        @media (max-width: 720px) {
          .shell {
            padding: 0.85rem 0.8rem 1.2rem;
          }
          .controls-head,
          .panel-head {
            flex-direction: column;
          }
          .panel-meta {
            justify-content: flex-start;
          }
          .button-row {
            width: 100%;
            justify-content: stretch;
          }
          .button-row :global(button) {
            flex: 1;
          }
          .details-grid {
            grid-template-columns: 1fr;
          }

          .modal {
            height: calc(100vh - 1.7rem);
          }
          .modal-head {
            flex-direction: column;
          }
        }
      `}</style>
    </main>
  );
}

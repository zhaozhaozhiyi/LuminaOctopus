import fs from 'node:fs/promises';
import path from 'node:path';
import type { CrawlState, JobSummary, LogEntry, ManifestEntry } from './types';

function getWorkspaceRoot(): string {
  const candidate = process.env.LUMINA_WORKSPACE_ROOT || process.env.INIT_CWD || process.cwd();
  return path.resolve(candidate);
}

export function getDefaultJobsDir(): string {
  return path.join(getWorkspaceRoot(), 'jobs');
}

export interface JobPaths {
  jobsRoot: string;
  jobRoot: string;
  siteRoot: string;
  stateFile: string;
  manifestFile: string;
  logFile: string;
}

function parseJson<T>(raw: string, fallback: T): T {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function getJobsRoot(outputRoot?: string): string {
  const workspaceRoot = getWorkspaceRoot();
  if (!outputRoot) return getDefaultJobsDir();
  const resolved = path.resolve(workspaceRoot, outputRoot);
  if (!resolved.startsWith(workspaceRoot)) {
    throw new Error('outputRoot must stay inside the workspace');
  }
  return resolved;
}

export function getJobPaths(jobId: string, outputRoot?: string): JobPaths {
  const jobsRoot = getJobsRoot(outputRoot);
  const jobRoot = path.join(jobsRoot, jobId);
  return {
    jobsRoot,
    jobRoot,
    siteRoot: path.join(jobRoot, 'site'),
    stateFile: path.join(jobRoot, 'state.json'),
    manifestFile: path.join(jobRoot, 'manifest.json'),
    logFile: path.join(jobRoot, 'log.ndjson'),
  };
}

export async function ensureJobPaths(paths: JobPaths): Promise<void> {
  await fs.mkdir(paths.siteRoot, { recursive: true });
}

export async function writeJobState(paths: JobPaths, state: CrawlState): Promise<void> {
  await ensureJobPaths(paths);
  await fs.writeFile(paths.stateFile, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
}

export async function readJobState(jobId: string, outputRoot?: string): Promise<CrawlState | null> {
  const paths = getJobPaths(jobId, outputRoot);
  try {
    const raw = await fs.readFile(paths.stateFile, 'utf8');
    return parseJson<CrawlState | null>(raw, null);
  } catch {
    return null;
  }
}

export async function writeManifest(paths: JobPaths, manifest: ManifestEntry[]): Promise<void> {
  await ensureJobPaths(paths);
  await fs.writeFile(paths.manifestFile, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
}

export async function readManifest(jobId: string, outputRoot?: string): Promise<ManifestEntry[]> {
  const paths = getJobPaths(jobId, outputRoot);
  try {
    const raw = await fs.readFile(paths.manifestFile, 'utf8');
    return parseJson<ManifestEntry[]>(raw, []);
  } catch {
    return [];
  }
}

export async function appendLog(paths: JobPaths, entry: LogEntry): Promise<void> {
  await ensureJobPaths(paths);
  await fs.appendFile(paths.logFile, `${JSON.stringify(entry)}\n`, 'utf8');
}

export async function readLogs(jobId: string, limit = 200, outputRoot?: string): Promise<LogEntry[]> {
  const paths = getJobPaths(jobId, outputRoot);
  try {
    const raw = await fs.readFile(paths.logFile, 'utf8');
    return raw
      .trim()
      .split('\n')
      .filter(Boolean)
      .slice(-limit)
      .map((line) => parseJson<LogEntry | null>(line, null))
      .filter((entry): entry is LogEntry => entry !== null);
  } catch {
    return [];
  }
}

export async function listJobs(outputRoot?: string): Promise<JobSummary[]> {
  const jobsRoot = getJobsRoot(outputRoot);
  try {
    const entries = await fs.readdir(jobsRoot, { withFileTypes: true });
    const states = await Promise.all(
      entries
        .filter((entry) => entry.isDirectory())
        .map(async (entry) => {
          const state = await readJobState(entry.name, outputRoot);
          if (!state) return null;
          return {
            jobId: state.jobId,
            status: state.status,
            baseUrl: state.baseUrl,
            outputPath: state.outputPath,
            startedAt: state.startedAt,
            stoppedAt: state.stoppedAt,
            filesDownloaded: state.filesDownloaded,
            pagesDiscovered: state.pagesDiscovered,
            assetsDownloaded: state.assetsDownloaded,
            degradedPages: state.degradedPages,
            errors: state.errors,
            lastError: state.lastError,
            warnings: state.warnings,
          } satisfies JobSummary;
        }),
    );
    const summaries: JobSummary[] = [];
    for (const entry of states) {
      if (entry) summaries.push(entry);
    }
    return summaries.sort((a, b) => (b.startedAt ?? 0) - (a.startedAt ?? 0));
  } catch {
    return [];
  }
}

export async function writeOutputFile(paths: JobPaths, localPath: string, body: Buffer | string): Promise<string> {
  const filePath = path.join(paths.siteRoot, localPath);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, body);
  return filePath;
}

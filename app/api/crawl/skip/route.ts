import { NextRequest, NextResponse } from 'next/server';
import { getEngine, getJobManager } from '@/lib/crawler-store';
import { appendLog } from '@/lib/crawler/job-store';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const jobId = typeof body?.jobId === 'string' ? body.jobId.trim() : '';
    const url = typeof body?.url === 'string' ? body.url.trim() : '';

    if (!jobId || !url) {
      return NextResponse.json({ error: 'Missing jobId or url' }, { status: 400 });
    }

    const engine = getEngine();
    if (!engine) {
      return NextResponse.json({ error: 'No active job engine' }, { status: 409 });
    }

    const state = engine.getState();
    if (state.jobId !== jobId) {
      return NextResponse.json({ error: 'Job is not active in this process' }, { status: 409 });
    }

    const result = engine.skip(url);
    const paths = getJobManager().getPaths(jobId);
    await appendLog(paths, {
      timestamp: Date.now(),
      jobId,
      level: 'info',
      event: 'skipped',
      message: `Skipped ${url}`,
      url,
      details: result,
    });

    return NextResponse.json({ ok: true, ...result, state: engine.getState() });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: 'Failed to skip url' }, { status: 500 });
  }
}


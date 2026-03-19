import { randomUUID } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { createOrGetEngine } from '@/lib/crawler-store';
import { getJobPaths } from '@/lib/crawler/job-store';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const url = typeof body?.url === 'string' ? body.url.trim() : '';
    if (!url) {
      return NextResponse.json({ error: 'Missing or invalid url' }, { status: 400 });
    }

    const maxDepth =
      typeof body?.maxDepth === 'number'
        ? Math.min(5, Math.max(0, body.maxDepth))
        : typeof body?.maxLevel === 'number'
          ? Math.min(5, Math.max(0, body.maxLevel))
          : 2;

    const maxConcurrent = typeof body?.maxConcurrent === 'number' ? Math.min(6, Math.max(1, body.maxConcurrent)) : 3;
    const delayMs = typeof body?.delayMs === 'number' ? Math.min(5000, Math.max(0, body.delayMs)) : 200;
    const sameSitePagesOnly = typeof body?.sameSitePagesOnly === 'boolean' ? body.sameSitePagesOnly : true;
    const respectRobots = typeof body?.respectRobots === 'boolean' ? body.respectRobots : true;

    const jobId = randomUUID();
    const outputRoot = 'jobs';
    const paths = getJobPaths(jobId, outputRoot);

    const engine = createOrGetEngine({
      baseUrl: url,
      maxDepth,
      maxConcurrent,
      delayMs,
      sameSitePagesOnly,
      respectRobots,
      jobId,
      outputRoot,
      outputPath: paths.siteRoot,
      renderMode: 'browser',
    });

    await engine.start();
    return NextResponse.json({
      jobId,
      outputPath: paths.siteRoot,
      state: engine.getState(),
    });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: 'Failed to start crawl' }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from 'next/server';
import { getJobManager } from '@/lib/crawler-store';

export async function GET(req: NextRequest) {
  const jobId = req.nextUrl.searchParams.get('jobId');
  if (!jobId) {
    return NextResponse.json({ error: 'Missing jobId' }, { status: 400 });
  }

  const limit = Number(req.nextUrl.searchParams.get('limit') ?? '200');
  const items = await getJobManager().readLogs(jobId, Number.isFinite(limit) ? Math.min(500, Math.max(1, limit)) : 200);
  return NextResponse.json({ items });
}

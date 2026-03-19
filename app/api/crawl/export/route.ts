import fs from 'node:fs/promises';
import path from 'node:path';
import { Readable, PassThrough } from 'node:stream';
import { NextRequest, NextResponse } from 'next/server';
import { getJobManager } from '@/lib/crawler-store';
import archiver from 'archiver';

function isSafeJobId(jobId: string): boolean {
  // Prevent path traversal and weird filesystem paths.
  if (!jobId) return false;
  if (jobId.includes('..') || jobId.includes('/') || jobId.includes('\\')) return false;
  return jobId.length <= 120;
}

export async function GET(req: NextRequest) {
  const jobId = req.nextUrl.searchParams.get('jobId');
  if (!jobId || !isSafeJobId(jobId)) {
    return NextResponse.json({ error: 'Missing or invalid jobId' }, { status: 400 });
  }

  const jobManager = getJobManager();
  const paths = jobManager.getPaths(jobId);

  try {
    const stat = await fs.stat(paths.siteRoot);
    if (!stat.isDirectory()) {
      return NextResponse.json({ error: 'No exported site directory found' }, { status: 400 });
    }
  } catch {
    return NextResponse.json({ error: 'No exported site directory found' }, { status: 400 });
  }

  const archive = archiver('zip', { zlib: { level: 9 } });
  const pass = new PassThrough();
  archive.on('warning', (err) => {
    console.warn('zip warning', err);
  });
  archive.on('error', (err) => {
    console.error('zip error', err);
    pass.destroy(err);
  });

  archive.pipe(pass);
  archive.directory(paths.siteRoot, false);
  void archive.finalize();

  const zipStream = Readable.toWeb(pass) as unknown as ReadableStream;
  const safeName = `lumina-octopus-${jobId}-${Date.now()}.zip`;
  const filename = path.basename(safeName);

  return new NextResponse(zipStream, {
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  });
}

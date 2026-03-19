import { NextResponse } from 'next/server';
import { getCrawlerState } from '@/lib/crawler-store';

export async function GET() {
  const state = getCrawlerState();
  return (
    NextResponse.json(
      state ?? {
        status: 'idle',
        jobId: '',
        outputPath: '',
        renderMode: 'browser',
        baseUrl: '',
        maxDepth: 0,
        maxConcurrent: 0,
        sameSitePagesOnly: true,
        delayMs: 0,
        respectRobots: true,
        filesDownloaded: 0,
        filesRemaining: 0,
        pagesDiscovered: 0,
        assetsDownloaded: 0,
        degradedPages: 0,
        errors: 0,
        warnings: [],
        items: [],
        lastUpdatedAt: Date.now(),
        resumeAvailable: false,
      },
    )
  );
}

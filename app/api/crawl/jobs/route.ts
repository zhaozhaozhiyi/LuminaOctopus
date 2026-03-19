import { NextResponse } from 'next/server';
import { getJobManager } from '@/lib/crawler-store';

export async function GET() {
  const items = await getJobManager().listJobs();
  return NextResponse.json({ items });
}

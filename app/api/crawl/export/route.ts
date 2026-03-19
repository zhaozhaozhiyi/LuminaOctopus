import { NextResponse } from 'next/server';
import { getEngine } from '@/lib/crawler-store';
import archiver from 'archiver';

export async function GET() {
  const engine = getEngine();
  if (!engine) {
    return NextResponse.json({ error: '暂无抓取结果' }, { status: 400 });
  }
  const files = engine.getDownloaded();
  if (files.size === 0) {
    return NextResponse.json({ error: '没有可导出的文件' }, { status: 400 });
  }

  const archive = archiver('zip', { zlib: { level: 9 } });
  const buffers: Buffer[] = [];
  archive.on('data', (chunk: Buffer) => buffers.push(chunk));

  await new Promise<void>((resolve, reject) => {
    archive.on('end', () => resolve());
    archive.on('error', (err) => reject(err));
    Array.from(files.entries()).forEach(([path, { body }]) => {
      const buf = typeof body === 'string' ? Buffer.from(body, 'utf8') : body;
      archive.append(buf, { name: path });
    });
    archive.finalize();
  });

  const zipBuffer = Buffer.concat(buffers);
  const filename = `lumina-octopus-crawl-${Date.now()}.zip`;

  return new NextResponse(zipBuffer, {
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Length': String(zipBuffer.length),
    },
  });
}

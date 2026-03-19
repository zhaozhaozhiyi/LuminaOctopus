import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: '拾光章鱼 / LuminaOctopus',
  description: '把网站抓取为可离线浏览的“站点快照”，并可暂停恢复、回看历史、导出带走。',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}

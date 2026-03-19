/**
 * URL 解析与规范化（纯 Node，Electron 可复用）
 */

import path from 'node:path';

export function normalizeUrl(url: string, base?: string): string {
  try {
    const parsed = base ? new URL(url, base) : new URL(url);
    parsed.hash = '';
    let path = parsed.pathname || '/';
    if (path.endsWith('/') && path.length > 1) path = path.slice(0, -1);
    parsed.pathname = path;
    return parsed.toString();
  } catch {
    return url;
  }
}

export function isSameOrigin(url: string, baseUrl: string): boolean {
  try {
    const u = new URL(url, baseUrl);
    const b = new URL(baseUrl);
    return u.origin === b.origin;
  } catch {
    return false;
  }
}

export function getOrigin(url: string): string {
  try {
    return new URL(url).origin;
  } catch {
    return '';
  }
}

/** 从 HTML 基址 + 相对路径得到绝对 URL */
export function resolveUrl(href: string, baseUrl: string): string {
  try {
    return new URL(href, baseUrl).href;
  } catch {
    return href;
  }
}

/**
 * 简易 URL 类型判断：用于离线 rewrite / 链接分类。
 * 当前实现目标是保证编译通过与基本可用性。
 */
export function isHttpUrl(url: string): boolean {
  return /^https?:\/\//i.test(url);
}

export type AnchorTargetKind = 'page' | 'asset';

/**
 * 将锚点链接分类：同源为 page，跨域为 asset（最小策略）。
 */
export function classifyAnchorTarget(absoluteUrl: string, baseUrl: string): AnchorTargetKind {
  return isSameOrigin(absoluteUrl, baseUrl) ? 'page' : 'asset';
}

/**
 * 判断是否跳过某些 URL（mailto/tel/#/javascript/data 等）。
 */
export function shouldSkipUrl(url: string): boolean {
  const lowered = url.trim().toLowerCase();
  if (!lowered) return true;
  return (
    lowered.startsWith('#') ||
    lowered.startsWith('mailto:') ||
    lowered.startsWith('tel:') ||
    lowered.startsWith('javascript:') ||
    lowered.startsWith('data:') ||
    lowered.startsWith('chrome:')
  );
}

function normalizePathForLocalFile(rawPath: string, fallbackFile: string): string {
  let p = rawPath || '/';
  if (p.endsWith('/')) p += 'index.html';
  if (!p.includes('.') && fallbackFile.endsWith('.html')) {
    p += '.html';
  }
  return p.replace(/^\//, '');
}

/**
 * 把 URL 映射到离线本地相对路径（最小策略，保证可落盘）。
 */
export function getLocalPathForUrl(
  absoluteUrl: string,
  kind: 'page' | 'asset',
  baseUrl: string,
  // source 预留给后续更细粒度策略
  _ctx?: { source?: string },
): string {
  try {
    const u = new URL(absoluteUrl);
    const pathname = u.pathname || '/';
    const localPath = normalizePathForLocalFile(pathname, kind === 'page' ? 'index.html' : 'asset.html');
    // 区分 page/asset，避免重名覆盖
    return kind === 'page' ? localPath : `__assets/${localPath}`;
  } catch {
    return kind === 'page' ? 'index.html' : '__assets/index.html';
  }
}

/**
 * 计算从 pageLocalPath 到另一个本地文件的相对引用路径。
 */
export function toRelativePath(fromPageLocalPath: string, toLocalPath: string): string {
  // fromPageLocalPath 被用于 HTML 的 href/src 替换，因此它可以是“文件路径”或“目录路径”。
  // 这里用最稳妥的方式：按文件名所在目录计算相对路径。
  try {
    const fromDir = path.extname(fromPageLocalPath) ? path.dirname(fromPageLocalPath) : fromPageLocalPath;
    const rel = path.relative(fromDir, toLocalPath);
    return rel.startsWith('.') ? rel : `./${rel}`;
  } catch {
    return toLocalPath;
  }
}

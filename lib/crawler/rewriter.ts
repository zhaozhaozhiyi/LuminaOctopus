import * as cheerio from 'cheerio';
import type { DiscoveredRef, DiscoverSource } from './types';
import {
  classifyAnchorTarget,
  getLocalPathForUrl,
  isHttpUrl,
  isSameOrigin,
  normalizeUrl,
  resolveUrl,
  shouldSkipUrl,
  toRelativePath,
} from './url-utils';

interface HtmlRewriteOptions {
  html: string;
  pageUrl: string;
  pageLocalPath: string;
  baseUrl: string;
  /**
   * 控制是否把跨站 <a>/<iframe> 也当作“可抓取的页面”。
   * - sameSitePagesOnly=true：仅同源页面，跨站锚点/iframe 退化为资源
   * - sameSitePagesOnly=false：跨站锚点/iframe 也当作页面
   */
  sameSitePagesOnly?: boolean;
}

interface HtmlRewriteResult {
  html: string;
  pageRefs: DiscoveredRef[];
  assetRefs: DiscoveredRef[];
  degradedReasons: string[];
}

interface CssRewriteOptions {
  cssText: string;
  cssUrl: string;
  cssLocalPath: string;
  baseUrl: string;
}

interface CssRewriteResult {
  cssText: string;
  assetRefs: DiscoveredRef[];
}

function addDiscoveredRef(list: DiscoveredRef[], value: DiscoveredRef) {
  if (!list.some((item) => item.absoluteUrl === value.absoluteUrl)) {
    list.push(value);
  }
}

function parseSrcset(value: string): Array<{ url: string; descriptor: string }> {
  return value
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const pieces = part.split(/\s+/);
      return {
        url: pieces[0] ?? '',
        descriptor: pieces.slice(1).join(' '),
      };
    })
    .filter((item) => item.url);
}

function buildOfflineScript(): string {
  return `
    (() => {
      try {
        if ('serviceWorker' in navigator) {
          navigator.serviceWorker.getRegistrations?.().then((regs) => regs.forEach((reg) => reg.unregister?.())).catch(() => {});
          Object.defineProperty(navigator, 'serviceWorker', {
            configurable: true,
            value: {
              register: async () => ({}),
              getRegistrations: async () => [],
              ready: Promise.resolve({}),
            },
          });
        }
      } catch {}
    })();
  `;
}

function maybeRewriteLink(rawValue: string, pageUrl: string, pageLocalPath: string, baseUrl: string, source: DiscoverSource, kind: 'page' | 'asset'): string {
  if (!rawValue || shouldSkipUrl(rawValue)) return rawValue;
  const absoluteUrl = resolveUrl(rawValue, pageUrl);
  if (!isHttpUrl(absoluteUrl)) return rawValue;
  const localPath = getLocalPathForUrl(absoluteUrl, kind, baseUrl, { source });
  return toRelativePath(pageLocalPath, localPath);
}

export function rewriteHtmlDocument(options: HtmlRewriteOptions): HtmlRewriteResult {
  const { html, pageUrl, pageLocalPath, baseUrl, sameSitePagesOnly = true } = options;
  const $ = cheerio.load(html);
  const pageRefs: DiscoveredRef[] = [];
  const assetRefs: DiscoveredRef[] = [];
  const degradedReasons = new Set<string>();

  $('base').remove();

  const addPageRef = (absoluteUrl: string, tagName: string, attribute: string) => {
    addDiscoveredRef(pageRefs, {
      url: absoluteUrl,
      absoluteUrl,
      source: tagName === 'iframe' ? 'iframe' : 'anchor',
      tagName,
      attribute,
    });
  };

  const addAssetRef = (absoluteUrl: string, source: DiscoverSource, tagName: string, attribute: string, rel?: string) => {
    addDiscoveredRef(assetRefs, {
      url: absoluteUrl,
      absoluteUrl,
      source,
      tagName,
      attribute,
      rel,
    });
  };

  $('[href]').each((_, element) => {
    const tagName = element.tagName.toLowerCase();
    const href = $(element).attr('href');
    if (!href || shouldSkipUrl(href)) return;
    const absoluteUrl = resolveUrl(href, pageUrl);
    if (!isHttpUrl(absoluteUrl)) return;

    if (tagName === 'a') {
      // 当允许跨站页面时，统一把 <a> 视为“可抓取的页面”
      const kind = !sameSitePagesOnly ? 'page' : classifyAnchorTarget(absoluteUrl, baseUrl);
      if (kind === 'page') {
        addPageRef(absoluteUrl, tagName, 'href');
        $(element).attr('href', maybeRewriteLink(href, pageUrl, pageLocalPath, baseUrl, 'anchor', 'page'));
      } else if (kind === 'asset') {
        addAssetRef(absoluteUrl, 'anchor', tagName, 'href');
        $(element).attr('href', maybeRewriteLink(href, pageUrl, pageLocalPath, baseUrl, 'anchor', 'asset'));
      }
      return;
    }

    const rel = ($(element).attr('rel') ?? '').toLowerCase();
    const relSource: DiscoverSource =
      rel.includes('manifest')
        ? 'manifest'
        : rel.includes('icon')
          ? 'icon'
          : rel.includes('modulepreload')
            ? 'modulepreload'
            : rel.includes('preload')
              ? 'preload'
              : 'stylesheet';

    addAssetRef(absoluteUrl, relSource, tagName, 'href', rel);
    $(element).attr('href', maybeRewriteLink(href, pageUrl, pageLocalPath, baseUrl, relSource, 'asset'));
  });

  $('[src]').each((_, element) => {
    const tagName = element.tagName.toLowerCase();
    const src = $(element).attr('src');
    if (!src || shouldSkipUrl(src)) return;
    const absoluteUrl = resolveUrl(src, pageUrl);
    if (!isHttpUrl(absoluteUrl)) return;

    const source: DiscoverSource =
      tagName === 'script'
        ? 'script'
        : tagName === 'iframe'
          ? 'iframe'
          : tagName === 'img'
            ? 'image'
            : 'media';

    if (tagName === 'iframe' && (!sameSitePagesOnly || isSameOrigin(absoluteUrl, baseUrl))) {
      addPageRef(absoluteUrl, tagName, 'src');
      $(element).attr('src', maybeRewriteLink(src, pageUrl, pageLocalPath, baseUrl, source, 'page'));
      return;
    }

    addAssetRef(absoluteUrl, source, tagName, 'src');
    $(element).attr('src', maybeRewriteLink(src, pageUrl, pageLocalPath, baseUrl, source, 'asset'));
  });

  $('[poster]').each((_, element) => {
    const poster = $(element).attr('poster');
    if (!poster || shouldSkipUrl(poster)) return;
    const absoluteUrl = resolveUrl(poster, pageUrl);
    if (!isHttpUrl(absoluteUrl)) return;
    addAssetRef(absoluteUrl, 'media', element.tagName.toLowerCase(), 'poster');
    $(element).attr('poster', maybeRewriteLink(poster, pageUrl, pageLocalPath, baseUrl, 'media', 'asset'));
  });

  $('[data]').each((_, element) => {
    const dataUrl = $(element).attr('data');
    if (!dataUrl || shouldSkipUrl(dataUrl)) return;
    const absoluteUrl = resolveUrl(dataUrl, pageUrl);
    if (!isHttpUrl(absoluteUrl)) return;
    addAssetRef(absoluteUrl, 'other', element.tagName.toLowerCase(), 'data');
    $(element).attr('data', maybeRewriteLink(dataUrl, pageUrl, pageLocalPath, baseUrl, 'other', 'asset'));
  });

  $('[srcset]').each((_, element) => {
    const srcset = $(element).attr('srcset');
    if (!srcset) return;
    const rewritten = parseSrcset(srcset)
      .map((entry) => {
        if (shouldSkipUrl(entry.url)) return [entry.url, entry.descriptor].filter(Boolean).join(' ');
        const absoluteUrl = resolveUrl(entry.url, pageUrl);
        if (!isHttpUrl(absoluteUrl)) return [entry.url, entry.descriptor].filter(Boolean).join(' ');
        addAssetRef(absoluteUrl, 'image', element.tagName.toLowerCase(), 'srcset');
        const local = maybeRewriteLink(entry.url, pageUrl, pageLocalPath, baseUrl, 'image', 'asset');
        return [local, entry.descriptor].filter(Boolean).join(' ');
      })
      .join(', ');
    $(element).attr('srcset', rewritten);
  });

  $('form[action]').each((_, element) => {
    const action = $(element).attr('action');
    if (!action || shouldSkipUrl(action)) return;
    const absoluteUrl = resolveUrl(action, pageUrl);
    if (!isHttpUrl(absoluteUrl)) return;
    degradedReasons.add('Contains form actions that require a live server.');
    if (isSameOrigin(absoluteUrl, baseUrl)) {
      $(element).attr('action', maybeRewriteLink(action, pageUrl, pageLocalPath, baseUrl, 'anchor', 'page'));
    }
  });

  $('script').each((_, element) => {
    const inline = $(element).html() ?? '';
    if (inline.includes('serviceWorker') && inline.includes('register')) {
      degradedReasons.add('Service worker registration was neutralized for offline preview.');
      $(element).html('/* Lumina Octopus removed service worker registration for offline preview. */');
    }
  });

  if ($('script').length > 0) {
    degradedReasons.add('Page includes live scripts; offline behavior may differ from the origin site.');
  }

  if ($('head').length > 0) {
    $('head').prepend(`<script data-lumina-offline>${buildOfflineScript()}</script>`);
  } else {
    $.root().prepend(`<script data-lumina-offline>${buildOfflineScript()}</script>`);
  }

  return {
    html: $.html(),
    pageRefs,
    assetRefs,
    degradedReasons: Array.from(degradedReasons),
  };
}

export function rewriteCssText(options: CssRewriteOptions): CssRewriteResult {
  const { cssText, cssUrl, cssLocalPath, baseUrl } = options;
  const assetRefs: DiscoveredRef[] = [];

  const registerAsset = (rawUrl: string, source: DiscoverSource) => {
    if (!rawUrl || shouldSkipUrl(rawUrl)) return rawUrl;
    const absoluteUrl = resolveUrl(rawUrl, cssUrl);
    if (!isHttpUrl(absoluteUrl)) return rawUrl;
    addDiscoveredRef(assetRefs, {
      url: absoluteUrl,
      absoluteUrl,
      source,
      tagName: 'style',
      attribute: source === 'style-import' ? '@import' : 'url()',
    });
    const localPath = getLocalPathForUrl(absoluteUrl, 'asset', baseUrl, { source });
    return toRelativePath(cssLocalPath, localPath);
  };

  const rewrittenImports = cssText.replace(/@import\s+(?:url\()?["']?([^"')\s]+)["']?\)?/gi, (match, rawUrl) => {
    const rewritten = registerAsset(rawUrl, 'style-import');
    return match.replace(rawUrl, rewritten);
  });

  const rewrittenCss = rewrittenImports.replace(/url\(\s*(['"]?)([^"')]+)\1\s*\)/gi, (match, _quote, rawUrl) => {
    const rewritten = registerAsset(rawUrl, 'style-url');
    return match.replace(rawUrl, rewritten);
  });

  return {
    cssText: rewrittenCss,
    assetRefs,
  };
}

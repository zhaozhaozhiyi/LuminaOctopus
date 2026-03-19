/**
 * 爬虫模块入口（纯 Node，Electron 可直接 require 此目录）
 */

export { CrawlEngine } from './engine';
export type { CrawlState, CrawlOptions, CrawlItem, CrawlStatus } from './types';
export { normalizeUrl, isSameOrigin, resolveUrl, getOrigin } from './url-utils';

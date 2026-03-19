import test from 'node:test';
import assert from 'node:assert/strict';

import {
  getLocalPathForUrl,
  normalizeUrl,
  toRelativePath,
} from '../lib/crawler/url-utils.ts';

test('normalizeUrl removes hashes and default ports', () => {
  assert.equal(normalizeUrl('https://example.com:443/docs/#intro'), 'https://example.com/docs');
  assert.equal(normalizeUrl('http://example.com:80/path/?a=1#top'), 'http://example.com/path?a=1');
});

test('getLocalPathForUrl maps pages and external assets deterministically', () => {
  assert.equal(getLocalPathForUrl('https://example.com/', 'page', 'https://example.com/'), 'index.html');
  assert.equal(getLocalPathForUrl('https://example.com/docs/getting-started', 'page', 'https://example.com/'), 'docs/getting-started/index.html');
  assert.match(
    getLocalPathForUrl('https://cdn.example.net/assets/app.css?v=2', 'asset', 'https://example.com/', {
      source: 'stylesheet',
    }),
    /^__external\/cdn\.example\.net\/assets\/app--[a-f0-9]{8}\.css$/,
  );
});

test('toRelativePath computes stable local references', () => {
  assert.equal(toRelativePath('docs/guide/index.html', 'assets/site.css'), '../../assets/site.css');
  assert.equal(toRelativePath('index.html', '__external/cdn.example.net/app.css'), './__external/cdn.example.net/app.css');
});

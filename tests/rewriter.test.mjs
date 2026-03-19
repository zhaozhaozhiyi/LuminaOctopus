import test from 'node:test';
import assert from 'node:assert/strict';

import { rewriteCssText, rewriteHtmlDocument } from '../lib/crawler/rewriter.ts';

test('rewriteHtmlDocument rewrites local pages and asset links', () => {
  const result = rewriteHtmlDocument({
    html: `
      <html>
        <head>
          <link rel="stylesheet" href="/static/site.css" />
        </head>
        <body>
          <a href="/docs">Docs</a>
          <a href="https://outside.example.com">Outside</a>
          <img src="/images/logo.png" alt="logo" />
        </body>
      </html>
    `,
    pageUrl: 'https://example.com/guide/intro',
    pageLocalPath: 'guide/intro/index.html',
    baseUrl: 'https://example.com',
  });

  assert.match(result.html, /href="\.\.\/\.\.\/docs\/index\.html"/);
  assert.match(result.html, /href="https:\/\/outside\.example\.com"/);
  assert.match(result.html, /src="\.\.\/\.\.\/images\/logo\.png"/);
  assert.equal(result.pageRefs.length, 1);
  assert.equal(result.assetRefs.length, 2);
  assert.ok(result.html.includes('data-lumina-offline'));
});

test('rewriteHtmlDocument flags service workers and forms as degraded', () => {
  const result = rewriteHtmlDocument({
    html: `
      <html>
        <body>
          <form action="/submit"></form>
          <script>navigator.serviceWorker.register('/sw.js')</script>
        </body>
      </html>
    `,
    pageUrl: 'https://example.com',
    pageLocalPath: 'index.html',
    baseUrl: 'https://example.com',
  });

  assert.ok(result.degradedReasons.some((reason) => reason.includes('form actions')));
  assert.ok(result.degradedReasons.some((reason) => reason.includes('Service worker')));
});

test('rewriteCssText rewrites url() and @import references', () => {
  const result = rewriteCssText({
    cssText: `
      @import url("/fonts/base.css");
      .hero { background-image: url("../images/hero.png"); }
    `,
    cssUrl: 'https://example.com/static/app.css',
    cssLocalPath: 'static/app.css',
    baseUrl: 'https://example.com',
  });

  assert.match(result.cssText, /@import url\("\.\.\/fonts\/base\.css"\)|@import url\(\.\.\/fonts\/base\.css\)/);
  assert.match(result.cssText, /url\("\.\.\/images\/hero\.png"\)|url\(\.\.\/images\/hero\.png\)/);
  assert.equal(result.assetRefs.length, 2);
});

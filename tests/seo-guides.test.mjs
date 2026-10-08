import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const slugs = [
  'siemens-s7-300-discontinued',
  'mitsubishi-q-series-discontinued',
  'omron-cj2m-discontinued',
  'allen-bradley-slc-500-discontinued',
];
const site = 'https://www.automation-outlet.co.uk/';
const read = (name) => readFileSync(path.join(root, name), 'utf8');
const extractJsonLd = (html) => {
  const tags = [...html.matchAll(/<script\b[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)];
  return tags.map((tag) => JSON.parse(tag[1]));
};

test('all SEO guides have distinct, indexable, canonical HTML pages', () => {
  const titles = new Set();
  for (const slug of slugs) {
    const html = read(slug + '.html');
    assert.match(html, /<html lang="en-GB">/);
    assert.match(html, /<meta name="description" content="[^"]{80,}"/);
    assert.match(html, new RegExp('rel="canonical" href="' + site + slug + '\\.html"'));
    assert.doesNotMatch(html, /<meta name="robots" content="noindex/);
    assert.match(html, /<h1\b[^>]*>/);
    assert.match(html, /<a class="btn big" href="\/obsolete-parts-sourcing.html">/);
    assert.match(html, /<a[^>]+href="\/consignment.html"/);
    assert.match(html, /<a[^>]+href="\/plc-lifecycle.html"/);
    assert.match(html, /<h2>Official manufacturer references<\/h2>/);
    assert.match(html, /<a href="https:\/\/[^"]+" target="_blank" rel="noopener noreferrer">/);
    const title = html.match(/<title>([^<]+)<\/title>/)?.[1];
    assert.ok(title && !titles.has(title), 'unique title required: ' + slug);
    titles.add(title);
    const schemas = extractJsonLd(html);
    assert.ok(schemas.some((s) => s['@type'] === 'TechArticle'), 'TechArticle missing');
    assert.ok(schemas.some((s) => s['@type'] === 'BreadcrumbList'), 'BreadcrumbList missing');
    const article = schemas.find((s) => s['@type'] === 'TechArticle');
    assert.equal(article.mainEntityOfPage, site + slug + '.html');
    assert.equal(article.dateModified, '2026-10-08');
    assert.ok(article.citation.length >= 2);
    const words = html.replace(/<script[\s\S]*?<\/script>/g, '').replace(/<style[\s\S]*?<\/style>/g, '').replace(/<[^>]+>/g, ' ').trim().split(/\s+/);
    assert.ok(words.length >= 550, slug + ' needs substantial useful content');
  }
});

test('the hub and post-build links connect all four articles', () => {
  const patch = read('patch_seo.py');
  assert.match(patch, /patch_seo_topic_cluster\(\)/);
  assert.match(patch, /id="plc-seo-hub-links"/);
  for (const slug of slugs) assert.ok(patch.includes('/' + slug + '.html'), 'missing discoverability for ' + slug);
  assert.match(read('plc-lifecycle.html'), /href="https:\/\/www\.automation-outlet\.co\.uk\/plc-lifecycle\.html"/);
});

test('sitemap and robots policies remain in place', () => {
  const release = read('release.py');
  assert.ok(release.includes('update_sitemap()'), 'sitemap generator is required');
  assert.ok(release.includes('if is_private_page(page.name):'), 'no admin pages in public sitemap');
  const robots = read('robots.txt');
  assert.match(robots, /Sitemap: https:\/\/www\.automation-outlet\.co\.uk\/sitemap.xml/);
});

test('non-search utility pages are noindexed and omitted from the public sitemap', () => {
  const sitemap = read('sitemap.xml');
  for (const page of ['cart.html', 'order-success.html']) {
    const html = read(page);
    assert.match(html, /<meta name="robots" content="noindex, nofollow">/);
    assert.ok(!sitemap.includes(site + page), 'utility URL must be absent from sitemap: ' + page);
  }
});

test('stock sitemap only advertises category URLs with live inventory', () => {
  const stockSitemap = read('api/stock-sitemap.mjs');
  assert.match(stockSitemap, /publicProducts\(products\)\.filter\(available\)/);
  assert.match(stockSitemap, /liveProducts\.some\(\(product\) => collection\.match\(product\)\)/);
});

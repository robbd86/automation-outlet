import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read = name => readFileSync(name, 'utf8');

test('indexable, distinct, canonical engineering tools pages', () => {
  for (const page of ['engineering-toolbox.html', 'wire-label-generator.html']) {
    const html = read(page);
    assert.match(html, /<html lang="en-GB">/);
    assert.match(html, new RegExp('<link rel="canonical" href="https://www\\.automation-outlet\\.co\\.uk/' + page.replace('.', '\\.') + '"'));
    assert.doesNotMatch(html, /<meta name="robots" content="noindex/i);
    assert.match(html, /<h1\b/);
    const schemas = [...html.matchAll(/<script[^>]+type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)].map(x => JSON.parse(x[1]));
    assert.ok(schemas.length > 0, page + ' requires JSON-LD');
  }
  assert.notEqual(read('engineering-toolbox.html').match(/<title>(.*?)<\/title>/)?.[1], read('wire-label-generator.html').match(/<title>(.*?)<\/title>/)?.[1]);
});

test('real label generator functions and privacy declarations are present', () => {
  const html=read('wire-label-generator.html');
  for (const feature of ['function parseDelimited(', 'async function parseXlsx(', 'function printLabels(', 'function makeCsv(', 'id="file"', 'id="mapAddress"', 'id="printBtn"', 'id="sample"']) {
    assert.ok(html.includes(feature), 'missing: ' + feature);
  }
  assert.match(html, /not sent to AO|No files are sent to AO/);
  assert.match(html, /100%/);
  assert.match(html, /href="\/obsolete-parts-sourcing\.html"/);
});

test('post-build discovery links and sitemap rules', () => {
  const release=read('release.py');
  for (const id of ['ao-toolbox-home', 'ao-toolbox-services', 'ao-toolbox-footer']) assert.ok(release.includes(id));
  for (const path of ['engineering-toolbox.html','wire-label-generator.html']) assert.ok(release.includes(path));
  assert.match(release, /for page in sorted\(ROOT\.glob\("\*\.html"\)\)/);
  assert.match(release, /update_sitemap\(\)/);
});

test('final built pages link to free toolbox and it is included in sitemap', () => {
  const home=read('index.html'),services=read('services.html'),sitemap=read('sitemap.xml');
  assert.match(home,/id="ao-toolbox-home"/);
  assert.match(services,/id="ao-toolbox-services"/);
  for (const page of ['engineering-toolbox.html','wire-label-generator.html']) {
    assert.ok(sitemap.includes('https://www.automation-outlet.co.uk/' + page));
  }
});

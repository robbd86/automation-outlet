import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

function catalogue(query = '') {
  const elements = new Map();
  const document = {getElementById(id) {
    if (!elements.has(id)) elements.set(id, {value: '', addEventListener() {}});
    return elements.get(id);
  }};
  const context = vm.createContext({document, window: {location: {search: query}},
    URLSearchParams, Intl, console, fetch: () => new Promise(() => {})});
  vm.runInContext(fs.readFileSync(new URL('../_blocks/stock_catalogue_js.html', import.meta.url), 'utf8'), context);
  vm.runInContext(`stockProducts = [
    {title:'Siemens output + Base', partNumber:'6ES7132-4BF00-0AA0', brand:'Siemens', category:'I/O'},
    {title:'Siemens output + Terminal', partNumber:'6ES7132-4BF00-0AA0', brand:'Siemens', category:'I/O'},
    {title:'Different Siemens output', partNumber:'6ES7132-4BF00-0AB0', brand:'Siemens', category:'I/O'},
    {title:'Omron output', partNumber:'CJ1W-OD261', brand:'Omron', category:'I/O'}
  ];`, context);
  return {elements, run: code => vm.runInContext(code, context)};
}

test('homepage query finds both physical lots despite spacing, case and hyphens', () => {
  for (const query of ['6ES7132-4BF00-0AA0','6es7 132 4bf00 0aa0','6ES71324BF000AA0']) {
    const app = catalogue('?q=' + encodeURIComponent(query));
    assert.equal(app.run('currentProducts().length'), 2);
  }
});
test('different model suffix is not conflated and brand filter still applies', () => {
  const app = catalogue('?q=6ES7132-4BF00-0AB0');
  assert.equal(app.run('currentProducts().length'), 1);
  app.elements.get('stockBrand').value = 'Omron';
  assert.equal(app.run('currentProducts().length'), 0);
});
test('ordinary descriptive search and no-match cases remain supported', () => {
  const app = catalogue('?q=Siemens%20output');
  assert.equal(app.run('currentProducts().length'), 3);
  app.elements.get('stockSearch').value = 'nonexistent-part';
  assert.equal(app.run('currentProducts().length'), 0);
});

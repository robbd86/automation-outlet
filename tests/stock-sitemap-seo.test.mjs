import test from "node:test";
import assert from "node:assert/strict";
import { renderSitemap } from "../api/stock-sitemap.mjs";

function item(overrides = {}) {
  return {
    id: "stock-1", slug: "siemens-6es7416-2xk02-0ab0",
    brand: "Siemens", partNumber: "6ES7416-2XK02-0AB0",
    title: "Siemens S7-400 CPU", category: "PLC CPU",
    status: "active", quantity: 1, issueState: "open",
    updatedAt: "2026-10-28T10:00:00.000Z", ...overrides
  };
}

test("stock sitemap lists canonical in-stock URLs and their real last-modified date", () => {
  const xml = renderSitemap([item()]);
  assert.match(xml, /<loc>https:\/\/www\.automation-outlet\.co\.uk\/stock\/siemens-6es7416-2xk02-0ab0<\/loc>/);
  assert.match(xml, /<lastmod>2026-10-28<\/lastmod>/);
  assert.match(xml, /<loc>https:\/\/www\.automation-outlet\.co\.uk\/parts\/siemens<\/loc>/);
  assert.doesNotMatch(xml, /<loc>https:\/\/www\.automation-outlet\.co\.uk\/parts\/mitsubishi<\/loc>/);
});

test("sold, reserved, closed and zero-quantity stock is not advertised for crawling", () => {
  const xml = renderSitemap([
    item({ id: "sold", slug: "sold-product", status: "sold" }),
    item({ id: "reserved", slug: "reserved-product", quantity: 0 }),
    item({ id: "closed", slug: "closed-product", issueState: "closed" }),
    item({ id: "out", slug: "out-product", status: "active", quantity: 0 }),
    item({ id: "live", slug: "live-product" }),
  ]);
  assert.match(xml, /\/stock\/live-product/);
  for (const slug of ["sold-product", "reserved-product", "closed-product", "out-product"]) {
    assert.doesNotMatch(xml, new RegExp("/stock/" + slug));
  }
});

test("sitemap uses the current available item when a slug has duplicate records", () => {
  const xml = renderSitemap([
    item({ id: "old", status: "sold", updatedAt: "2026-10-29" }),
    item({ id: "new", status: "active", quantity: 2, updatedAt: "2026-10-27" }),
  ]);
  assert.equal((xml.match(/\/stock\/siemens-6es7416-2xk02-0ab0/g) || []).length, 1);
  assert.match(xml, /<lastmod>2026-10-27<\/lastmod>/);
});

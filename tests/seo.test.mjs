import test from "node:test";
import assert from "node:assert/strict";

import {
  collections,
  productListingTitle,
  productSeoTitle,
  relatedProducts,
  browseLinks,
} from "../lib/shop.mjs";
import { resolveCollection, renderCatalogue } from "../api/catalogue.mjs";

function activeProduct(overrides = {}) {
  return {
    id: "test-product",
    status: "active",
    quantity: 1,
    issueState: "open",
    deliveryMode: "parcel",
    priceGbp: 100,
    condition: "Used",
    updatedAt: "2026-09-16T08:00:00Z",
    ...overrides,
  };
}

test("SEO product title uses the real listing description, not a generic category", () => {
  const product = activeProduct({
    brand: "Siemens",
    partNumber: "6ES7952-1KM00-0AA0",
    title: "Siemens SIMATIC S7-400 4MB Memory Card 6ES7952-1KM00-0AA0",
    category: "Other automation",
  });

  assert.equal(
    productListingTitle(product),
    "Siemens 6ES7952-1KM00-0AA0 SIMATIC S7-400 4MB Memory Card"
  );
  assert.equal(
    productSeoTitle(product),
    "Siemens 6ES7952-1KM00-0AA0 SIMATIC S7-400 4MB Memory Card | Automation Outlet UK"
  );
  assert.doesNotMatch(productSeoTitle(product), /Other automation/i);
});

test("related products favour brand and part family and ignore generic-category noise", () => {
  const source = activeProduct({
    id: "source",
    brand: "Siemens",
    partNumber: "6ES7952-1KM00-0AA0",
    title: "Siemens SIMATIC S7-400 4MB Memory Card",
    category: "Other automation",
  });
  const sameFamily = activeProduct({
    id: "same-family",
    brand: "Siemens",
    partNumber: "6ES7414-2XK05-0AB0",
    title: "Siemens SIMATIC S7-400 CPU",
    category: "PLC CPU",
  });
  const sameBrand = activeProduct({
    id: "same-brand",
    brand: "Siemens",
    partNumber: "3RT2026-1BB40",
    title: "Siemens Contactor",
    category: "Motor starter",
  });
  const randomGeneric = activeProduct({
    id: "random",
    brand: "Honeywell",
    partNumber: "ABC123",
    title: "Honeywell Burner Control",
    category: "Other automation",
  });

  const results = relatedProducts(source, [source, randomGeneric, sameBrand, sameFamily], 4);
  assert.deepEqual(results.map(p => p.id), ["same-family", "same-brand"]);
});

test("brand pages resolve automatically from live catalogue brands", () => {
  const products = [
    activeProduct({ id: "abb-1", brand: "ABB", partNumber: "ACS355", title: "ABB ACS355 Drive", category: "Drive / inverter" }),
    activeProduct({ id: "omron-1", brand: "Omron", partNumber: "CJ2M-CPU32", title: "Omron CJ2M-CPU32", category: "PLC CPU" }),
  ];

  const abb = resolveCollection("abb", products);
  assert.ok(abb);
  assert.match(abb.title, /^ABB Industrial Automation Parts/);
  assert.equal(abb.match(products[0]), true);
  assert.equal(abb.match(products[1]), false);

  const html = renderCatalogue("abb", products);
  assert.match(html, /ABB Industrial Automation Parts for Sale UK/);
  assert.match(html, /\/stock\/abb-acs355/);
});

test("browse links include dynamic brands and expanded equipment categories", () => {
  const products = [
    activeProduct({ id: "abb-1", brand: "ABB", partNumber: "ACS355", title: "ABB ACS355 Drive", category: "Drive / inverter" }),
  ];

  assert.ok(collections["hmi-panels"]);
  assert.ok(collections["safety-modules"]);
  assert.ok(collections["power-supplies"]);
  assert.match(browseLinks(products), /href="\/parts\/abb"/);
  assert.match(browseLinks(products), /href="\/parts\/hmi-panels"/);
});

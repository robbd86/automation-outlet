import test, { beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import stock from "../api/stock.mjs";

function responseCapture() {
  return {
    code: 200,
    body: null,
    headers: {},
    setHeader(k, v) { this.headers[k] = v; },
    status(code) { this.code = code; return this; },
    json(value) { this.body = value; return value; },
  };
}

let oldFetch, oldToken, oldKey;
beforeEach(() => {
  oldFetch = global.fetch;
  oldToken = process.env.AO_GITHUB_TOKEN;
  oldKey = process.env.AO_DEAL_DESK_KEY;
  process.env.AO_GITHUB_TOKEN = "github-test";
  process.env.AO_DEAL_DESK_KEY = "manager-test-key";
});
afterEach(() => {
  global.fetch = oldFetch;
  if (oldToken === undefined) delete process.env.AO_GITHUB_TOKEN; else process.env.AO_GITHUB_TOKEN = oldToken;
  if (oldKey === undefined) delete process.env.AO_DEAL_DESK_KEY; else process.env.AO_DEAL_DESK_KEY = oldKey;
});

function requestBody(deliveryMode) {
  return {
    title: "Stripe Sandbox Test Item",
    partNumber: "TEST-DELIVERY",
    brand: "Automation Outlet",
    category: "Other automation",
    condition: "New without box",
    priceGbp: 1,
    quantity: 1,
    status: "active",
    deliveryMode,
    sortOrder: 100,
  };
}

test("Stock Manager persists parcel checkout eligibility", async () => {
  let createdIssue = null;
  global.fetch = async (url, options = {}) => {
    if (String(url).endsWith("/labels") && options.method === "POST") {
      return { ok: true, status: 201, json: async () => ({}) };
    }
    if (String(url).endsWith("/issues") && options.method === "POST") {
      createdIssue = JSON.parse(options.body);
      return { ok: true, status: 201, json: async () => ({ number: 321, state: "open" }) };
    }
    throw new Error("Unexpected fetch: " + url);
  };

  const response = responseCapture();
  await stock({
    method: "POST",
    headers: { "x-deal-desk-key": "manager-test-key" },
    body: requestBody("parcel"),
  }, response);

  assert.equal(response.code, 201);
  assert.equal(response.body.product.deliveryMode, "parcel");
  assert.match(createdIssue.body, /Delivery \/ checkout:\*\* UK parcel checkout/);
});

test("unknown or missing delivery mode fails safe to quote required", async () => {
  global.fetch = async (url, options = {}) => {
    if (String(url).endsWith("/labels") && options.method === "POST") {
      return { ok: true, status: 201, json: async () => ({}) };
    }
    if (String(url).endsWith("/issues") && options.method === "POST") {
      return { ok: true, status: 201, json: async () => ({ number: 322, state: "open" }) };
    }
    throw new Error("Unexpected fetch: " + url);
  };

  for (const mode of [undefined, "anything"]) {
    const body = requestBody(mode);
    if (mode === undefined) delete body.deliveryMode;
    const response = responseCapture();
    await stock({
      method: "POST",
      headers: { "x-deal-desk-key": "manager-test-key" },
      body,
    }, response);
    assert.equal(response.code, 201);
    assert.equal(response.body.product.deliveryMode, "quote");
  }
});

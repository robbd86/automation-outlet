import test from "node:test";
import assert from "node:assert/strict";
import checkout from "../api/create-checkout-session.mjs";

const product = {
  id: "stock-1",
  brand: "Siemens",
  partNumber: "6ES7-TEST",
  title: "Test PLC module",
  category: "PLC I/O module",
  condition: "Used",
  priceGbp: 15,
  quantity: 2,
  status: "active",
  issueState: "open",
  updatedAt: "2026-09-12",
};

function issueFor(value) {
  return { state: "open", body: "<!-- AO_STOCK_B64:" + Buffer.from(JSON.stringify(value)).toString("base64") + " -->" };
}

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

test("sandbox checkout validates stock and price server-side", async () => {
  const oldFetch = global.fetch;
  const oldToken = process.env.AO_GITHUB_TOKEN;
  const oldStripe = process.env.STRIPE_SECRET_KEY;
  process.env.AO_GITHUB_TOKEN = "github-test";
  process.env.STRIPE_SECRET_KEY = "sk_test_placeholder";
  let stripeBody = "";

  try {
    global.fetch = async (url, options = {}) => {
      if (String(url).includes("api.github.com")) {
        return { ok: true, status: 200, json: async () => [issueFor(product)] };
      }
      if (String(url).includes("api.stripe.com")) {
        stripeBody = String(options.body || "");
        return { ok: true, status: 200, json: async () => ({ id: "cs_test_123", url: "https://checkout.stripe.com/c/pay/cs_test_123" }) };
      }
      throw new Error("Unexpected fetch: " + url);
    };

    const response = responseCapture();
    await checkout({
      method: "POST",
      body: { items: [{ id: "siemens-6es7-test", quantity: 2, price: 0.01 }] },
      headers: { host: "www.automation-outlet.co.uk", "x-forwarded-proto": "https" },
    }, response);

    assert.equal(response.code, 200);
    assert.equal(response.body.sandbox, true);
    assert.match(stripeBody, /line_items%5B0%5D%5Bprice_data%5D%5Bunit_amount%5D=1500/);
    assert.match(stripeBody, /line_items%5B0%5D%5Bquantity%5D=2/);
    assert.match(stripeBody, /shipping_address_collection%5Ballowed_countries%5D%5B0%5D=GB/);
  } finally {
    global.fetch = oldFetch;
    if (oldToken === undefined) delete process.env.AO_GITHUB_TOKEN; else process.env.AO_GITHUB_TOKEN = oldToken;
    if (oldStripe === undefined) delete process.env.STRIPE_SECRET_KEY; else process.env.STRIPE_SECRET_KEY = oldStripe;
  }
});

test("sandbox endpoint refuses live Stripe keys", async () => {
  const oldStripe = process.env.STRIPE_SECRET_KEY;
  process.env.STRIPE_SECRET_KEY = "sk_live_placeholder";
  try {
    const response = responseCapture();
    await checkout({ method: "POST", body: { items: [{ id: "x", quantity: 1 }] }, headers: {} }, response);
    assert.equal(response.code, 503);
    assert.match(response.body.error, /not a test key/i);
  } finally {
    if (oldStripe === undefined) delete process.env.STRIPE_SECRET_KEY; else process.env.STRIPE_SECRET_KEY = oldStripe;
  }
});

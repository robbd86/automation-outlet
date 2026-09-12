import test from "node:test";
import assert from "node:assert/strict";
import verify from "../api/verify-checkout-session.mjs";

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

test("verifies paid Stripe sandbox sessions server-side", async () => {
  const oldFetch = global.fetch;
  const oldStripe = process.env.STRIPE_SECRET_KEY;
  process.env.STRIPE_SECRET_KEY = "sk_test_placeholder";
  try {
    global.fetch = async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        payment_status: "paid",
        status: "complete",
        amount_total: 15665,
        currency: "gbp",
        customer_details: { email: "buyer@example.com", name: "Buyer" },
        metadata: { ao_webhook_status: "paid_test_acknowledged_v2", ao_stock_action: "reduced", ao_order_status: "awaiting_dispatch" },
        line_items: { data: [{ description: "Siemens 6ES7-TEST", quantity: 1, amount_total: 15665, currency: "gbp" }] },
      }),
    });
    const response = responseCapture();
    await verify({ method: "GET", query: { session_id: "cs_test_abc123" } }, response);
    assert.equal(response.code, 200);
    assert.equal(response.body.paid, true);
    assert.equal(response.body.amountTotal, 15665);
    assert.equal(response.body.items[0].quantity, 1);
    assert.equal(response.body.webhookAcknowledged, true);
    assert.equal(response.body.stockAction, "reduced");
    assert.equal(response.body.orderStatus, "awaiting_dispatch");
  } finally {
    global.fetch = oldFetch;
    if (oldStripe === undefined) delete process.env.STRIPE_SECRET_KEY; else process.env.STRIPE_SECRET_KEY = oldStripe;
  }
});

test("rejects malformed session IDs", async () => {
  const oldStripe = process.env.STRIPE_SECRET_KEY;
  process.env.STRIPE_SECRET_KEY = "sk_test_placeholder";
  try {
    const response = responseCapture();
    await verify({ method: "GET", query: { session_id: "not-a-session" } }, response);
    assert.equal(response.code, 400);
  } finally {
    if (oldStripe === undefined) delete process.env.STRIPE_SECRET_KEY; else process.env.STRIPE_SECRET_KEY = oldStripe;
  }
});


test("verifies paid live commissioning sessions with the live key", async () => {
  const oldFetch = global.fetch;
  const oldLiveStripe = process.env.STRIPE_LIVE_SECRET_KEY;
  process.env.STRIPE_LIVE_SECRET_KEY = "sk_live_verify_only";
  let auth = "";
  try {
    global.fetch = async (_url, options = {}) => {
      auth = options.headers.Authorization;
      return {
        ok: true,
        status: 200,
        json: async () => ({
          id: "cs_live_abc123",
          livemode: true,
          payment_status: "paid",
          status: "complete",
          amount_total: 100,
          currency: "gbp",
          customer_details: { email: "buyer@example.com", name: "Buyer" },
          metadata: {
            ao_environment: "live",
            ao_commissioning: "true",
            ao_webhook_status: "paid_live_acknowledged_v1",
            ao_stock_action: "reduced",
            ao_order_status: "awaiting_dispatch",
          },
          line_items: { data: [{ description: "Automation Outlet TEST £1", quantity: 1, amount_total: 100, currency: "gbp" }] },
        }),
      };
    };
    const response = responseCapture();
    await verify({ method: "GET", query: { session_id: "cs_live_abc123" } }, response);
    assert.equal(response.code, 200);
    assert.equal(auth, "Bearer sk_live_verify_only");
    assert.equal(response.body.paid, true);
    assert.equal(response.body.live, true);
    assert.equal(response.body.sandbox, false);
    assert.equal(response.body.commissioning, true);
    assert.equal(response.body.amountTotal, 100);
    assert.equal(response.body.webhookAcknowledged, true);
    assert.equal(response.body.stockAction, "reduced");
  } finally {
    global.fetch = oldFetch;
    if (oldLiveStripe === undefined) delete process.env.STRIPE_LIVE_SECRET_KEY; else process.env.STRIPE_LIVE_SECRET_KEY = oldLiveStripe;
  }
});

test("rejects live sessions that are not AO commissioning sessions", async () => {
  const oldFetch = global.fetch;
  const oldLiveStripe = process.env.STRIPE_LIVE_SECRET_KEY;
  process.env.STRIPE_LIVE_SECRET_KEY = "sk_live_verify_only";
  try {
    global.fetch = async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        id: "cs_live_other",
        livemode: true,
        payment_status: "paid",
        status: "complete",
        metadata: { ao_environment: "live" },
        line_items: { data: [] },
      }),
    });
    const response = responseCapture();
    await verify({ method: "GET", query: { session_id: "cs_live_other" } }, response);
    assert.equal(response.code, 403);
  } finally {
    global.fetch = oldFetch;
    if (oldLiveStripe === undefined) delete process.env.STRIPE_LIVE_SECRET_KEY; else process.env.STRIPE_LIVE_SECRET_KEY = oldLiveStripe;
  }
});

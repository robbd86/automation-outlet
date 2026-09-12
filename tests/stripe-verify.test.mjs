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
        line_items: { data: [{ description: "Siemens 6ES7-TEST", quantity: 1, amount_total: 15665, currency: "gbp" }] },
      }),
    });
    const response = responseCapture();
    await verify({ method: "GET", query: { session_id: "cs_test_abc123" } }, response);
    assert.equal(response.code, 200);
    assert.equal(response.body.paid, true);
    assert.equal(response.body.amountTotal, 15665);
    assert.equal(response.body.items[0].quantity, 1);
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

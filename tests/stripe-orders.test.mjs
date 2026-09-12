import test, { beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import dealDesk from "../api/deal-desk.mjs";

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

let oldFetch, oldStripe, oldKey;
beforeEach(() => {
  oldFetch = global.fetch;
  oldStripe = process.env.STRIPE_SECRET_KEY;
  oldKey = process.env.AO_DEAL_DESK_KEY;
  process.env.STRIPE_SECRET_KEY = "sk_test_orders_only";
  process.env.AO_DEAL_DESK_KEY = "private-test-key";
});
afterEach(() => {
  global.fetch = oldFetch;
  if (oldStripe === undefined) delete process.env.STRIPE_SECRET_KEY; else process.env.STRIPE_SECRET_KEY = oldStripe;
  if (oldKey === undefined) delete process.env.AO_DEAL_DESK_KEY; else process.env.AO_DEAL_DESK_KEY = oldKey;
});

test("requires the private manager key", async () => {
  const response = responseCapture();
  await dealDesk({ method: "GET", headers: {}, query: { view: "orders" } }, response);
  assert.equal(response.code, 401);
});

test("fails closed when a live Stripe key is configured", async () => {
  process.env.STRIPE_SECRET_KEY = "sk_live_never_here";
  const response = responseCapture();
  await dealDesk({ method: "GET", headers: { "x-deal-desk-key": "private-test-key" }, query: { view: "orders" } }, response);
  assert.equal(response.code, 503);
});

test("returns only AO sandbox Checkout Sessions with safe order fields", async () => {
  const session = {
    id: "cs_test_ao1", created: 1789232400, mode: "payment", status: "complete",
    payment_status: "paid", amount_subtotal: 100, amount_total: 895,
    total_details: { amount_shipping: 795 }, currency: "gbp",
    metadata: {
      ao_environment: "sandbox",
      ao_webhook_status: "paid_test_acknowledged_v2",
      ao_stock_action: "reduced",
      ao_order_status: "awaiting_dispatch",
      ao_order_issue: "901",
      ao_order_repo: "robbd86/automation-outlet-orders",
    },
    customer_details: { name: "Test Buyer", email: "test@example.com", phone: "07123456789" },
    collected_information: { shipping_details: { name: "Test Buyer", address: { line1: "1 Test Road", city: "Cambridge", postal_code: "CB1 1AA", country: "GB" } } },
  };
  global.fetch = async (url, options) => {
    assert.equal(options.headers.Authorization, "Bearer sk_test_orders_only");
    if (String(url).includes("/v1/checkout/sessions?")) {
      assert.doesNotMatch(String(url), /data\.line_items/);
      return { ok: true, json: async () => ({ data: [session, { id: "cs_test_unrelated", mode: "payment", metadata: {} }] }) };
    }
    assert.match(String(url), /\/v1\/checkout\/sessions\/cs_test_ao1\?/);
    assert.match(String(url), /line_items\.data\.price\.product/);
    return { ok: true, json: async () => ({
      ...session,
      line_items: { data: [{
        description: "Stripe Sandbox Test Item", quantity: 1, amount_total: 100, currency: "gbp",
        price: { product: { metadata: { part_number: "TEST £1", ao_stock_id: "test-1" } } },
      }] },
    }) };
  };
  const response = responseCapture();
  await dealDesk({ method: "GET", headers: { "x-deal-desk-key": "private-test-key" }, query: { view: "orders" } }, response);
  assert.equal(response.code, 200);
  assert.equal(response.body.orders.length, 1);
  const order = response.body.orders[0];
  assert.equal(order.id, "cs_test_ao1");
  assert.equal(order.webhookAcknowledged, true);
  assert.equal(order.stockAction, "reduced");
  assert.equal(order.orderStatus, "awaiting_dispatch");
  assert.equal(order.notificationIssue, 901);
  assert.equal(order.notificationRepo, "robbd86/automation-outlet-orders");
  assert.equal(order.productSubtotal, 100);
  assert.equal(order.shippingAmount, 795);
  assert.equal(order.amountTotal, 895);
  assert.equal(order.items[0].partNumber, "TEST £1");
  assert.equal(order.shipping.address.postalCode, "CB1 1AA");
});


test("legacy sandbox order links remain on the original private repo", async () => {
  const legacy = {
    id: "cs_test_legacy", created: 1789232401, mode: "payment", status: "complete",
    payment_status: "paid", amount_total: 895, amount_subtotal: 100, currency: "gbp",
    total_details: { amount_shipping: 795 },
    metadata: {
      ao_environment: "sandbox",
      ao_order_issue: "163",
      ao_order_status: "dispatched",
      ao_stock_action: "reduced",
      ao_webhook_status: "paid_test_acknowledged_v2"
    },
    line_items: { data: [] }
  };
  global.fetch = async (url, options) => {
    assert.equal(options.headers.Authorization, "Bearer sk_test_orders_only");
    if (String(url).includes("/v1/checkout/sessions?")) {
      return { ok: true, json: async () => ({ data: [legacy] }) };
    }
    return { ok: true, json: async () => legacy };
  };
  const response = responseCapture();
  await dealDesk({ method: "GET", headers: { "x-deal-desk-key": "private-test-key" }, query: { view: "orders" } }, response);
  assert.equal(response.code, 200);
  assert.equal(response.body.orders[0].notificationRepo, "robbd86/automation-outlet-site");
});

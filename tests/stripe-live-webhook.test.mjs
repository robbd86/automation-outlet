import test, { beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import webhook from "../api/stripe-webhook.mjs";

const signingSecret = "whsec_live_commissioning_test";
const sessionId = "cs_live_ao123";
let oldFetch, oldLiveSecret, oldSigningSecret, oldSandboxSecret, oldSandboxKey, oldGithubToken;

function paidSession() {
  return {
    id: sessionId,
    object: "checkout.session",
    livemode: true,
    mode: "payment",
    status: "complete",
    payment_status: "paid",
    amount_subtotal: 100,
    amount_total: 100,
    total_details: { amount_shipping: 0 },
    currency: "gbp",
    metadata: {
      ao_environment: "live",
      ao_commissioning: "true",
      ao_reservation_id: "aor_live_test",
      ao_stock_action: "reserved",
      ao_order_status: "payment_pending",
    },
    customer_details: { name: "Live Test Buyer", email: "live@example.com", phone: "07000000000" },
    collected_information: {
      shipping_details: {
        name: "Live Test Buyer",
        address: { line1: "1 Test Road", city: "Cambridge", postal_code: "CB1 1AA", country: "GB" },
      },
    },
  };
}

function event(type = "checkout.session.completed") {
  return {
    id: "evt_live_1",
    type,
    livemode: true,
    data: { object: paidSession() },
  };
}

function request(value = event(), options = {}) {
  const body = typeof value === "string" ? value : JSON.stringify(value);
  const timestamp = Math.floor(Date.now() / 1000);
  const digest = createHmac("sha256", options.secret || signingSecret)
    .update(`${timestamp}.${body}`)
    .digest("hex");
  return new Request("https://ao.example/api/stripe-live-webhook", {
    method: "POST",
    body,
    headers: {
      "Content-Type": "application/json",
      "stripe-signature": options.signature ?? `t=${timestamp},v1=${digest}`,
    },
  });
}

async function invoke(value, options) {
  const response = await webhook.fetch(request(value, options));
  return { code: response.status, body: await response.json() };
}

beforeEach(() => {
  oldFetch = global.fetch;
  oldLiveSecret = process.env.STRIPE_LIVE_SECRET_KEY;
  oldSigningSecret = process.env.STRIPE_LIVE_WEBHOOK_SECRET;
  oldSandboxSecret = process.env.STRIPE_WEBHOOK_SECRET;
  oldSandboxKey = process.env.STRIPE_SECRET_KEY;
  oldGithubToken = process.env.AO_GITHUB_TOKEN;
  process.env.STRIPE_LIVE_SECRET_KEY = "sk_live_unit_test_only";
  process.env.STRIPE_LIVE_WEBHOOK_SECRET = signingSecret;
  process.env.AO_GITHUB_TOKEN = "github-test";
  delete process.env.STRIPE_WEBHOOK_SECRET;
  delete process.env.STRIPE_SECRET_KEY;
  global.fetch = async () => { throw new Error("Unexpected network request"); };
});

afterEach(() => {
  global.fetch = oldFetch;
  if (oldLiveSecret === undefined) delete process.env.STRIPE_LIVE_SECRET_KEY; else process.env.STRIPE_LIVE_SECRET_KEY = oldLiveSecret;
  if (oldSigningSecret === undefined) delete process.env.STRIPE_LIVE_WEBHOOK_SECRET; else process.env.STRIPE_LIVE_WEBHOOK_SECRET = oldSigningSecret;
  if (oldSandboxSecret === undefined) delete process.env.STRIPE_WEBHOOK_SECRET; else process.env.STRIPE_WEBHOOK_SECRET = oldSandboxSecret;
  if (oldSandboxKey === undefined) delete process.env.STRIPE_SECRET_KEY; else process.env.STRIPE_SECRET_KEY = oldSandboxKey;
  if (oldGithubToken === undefined) delete process.env.AO_GITHUB_TOKEN; else process.env.AO_GITHUB_TOKEN = oldGithubToken;
});

test("live webhook verifies its own signing secret and ignores unrelated event types", async () => {
  const result = await invoke(event("payment_intent.succeeded"));
  assert.equal(result.code, 200);
  assert.deepEqual(result.body, { received: true, ignored: true });
});

test("live webhook rejects an invalid live signature", async () => {
  const result = await invoke(event(), { secret: "whsec_wrong" });
  assert.equal(result.code, 400);
});

test("paid live commissioning checkout commits stock, creates the private order and acknowledges Stripe", async () => {
  const reserve = {
    schema: 1,
    kind: "reserve",
    reservationId: "aor_live_test",
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 600000).toISOString(),
    items: [{ stockId: "test-1-563b", partNumber: "TEST £1", quantity: 1 }],
  };
  const comments = [{
    id: 10,
    body: "<!-- AO_INV_B64:" + Buffer.from(JSON.stringify(reserve)).toString("base64") + " -->",
  }];
  const stored = paidSession();
  let orderIssue = null;
  let idempotencyKey = "";

  global.fetch = async (url, options = {}) => {
    const value = String(url);

    if (value.includes("api.github.com") && value.includes("/issues/1/comments")) {
      if (options.method === "POST") {
        const payload = JSON.parse(options.body);
        const comment = { id: 11, body: payload.body };
        comments.push(comment);
        return Response.json(comment, { status: 201 });
      }
      return Response.json(comments);
    }

    if (value.includes("api.github.com") && value.includes("/issues?state=all&labels=ao-order")) {
      return Response.json(orderIssue ? [orderIssue] : []);
    }
    if (value.includes("api.github.com") && value.endsWith("/labels")) {
      return Response.json({}, { status: 201 });
    }
    if (value.includes("api.github.com") && value.endsWith("/issues") && options.method === "POST") {
      const payload = JSON.parse(options.body);
      orderIssue = { number: 902, title: payload.title, body: payload.body };
      return Response.json(orderIssue, { status: 201 });
    }

    if (value.startsWith(`https://api.stripe.com/v1/checkout/sessions/${sessionId}?`)) {
      assert.equal(options.headers.Authorization, "Bearer sk_live_unit_test_only");
      return Response.json({
        ...stored,
        line_items: {
          data: [{
            description: "Automation Outlet TEST £1",
            quantity: 1,
            amount_total: 100,
            currency: "gbp",
            price: { product: { metadata: { part_number: "TEST £1", ao_stock_id: "test-1-563b" } } },
          }],
        },
      });
    }

    if (value === `https://api.stripe.com/v1/checkout/sessions/${sessionId}`) {
      assert.equal(options.headers.Authorization, "Bearer sk_live_unit_test_only");
      if (options.method === "POST") {
        idempotencyKey = options.headers["Idempotency-Key"];
        const params = Object.fromEntries(new URLSearchParams(options.body));
        stored.metadata.ao_webhook_status = params["metadata[ao_webhook_status]"];
        stored.metadata.ao_stock_action = params["metadata[ao_stock_action]"];
        stored.metadata.ao_order_status = params["metadata[ao_order_status]"];
        stored.metadata.ao_order_issue = params["metadata[ao_order_issue]"];
        stored.metadata.ao_order_repo = params["metadata[ao_order_repo]"];
      }
      return Response.json(stored);
    }

    throw new Error("Unexpected fetch: " + url);
  };

  const result = await invoke(event());
  assert.equal(result.code, 200);
  assert.equal(result.body.live, true);
  assert.equal(result.body.recorded, true);
  assert.equal(result.body.stockChanged, true);
  assert.equal(result.body.notificationCreated, true);
  assert.equal(comments.length, 2);
  assert.match(comments[1].body, /AO inventory paid/);
  assert.equal(stored.metadata.ao_webhook_status, "paid_live_acknowledged_v1");
  assert.equal(stored.metadata.ao_stock_action, "reduced");
  assert.equal(stored.metadata.ao_order_status, "awaiting_dispatch");
  assert.equal(stored.metadata.ao_order_issue, "902");
  assert.equal(stored.metadata.ao_order_repo, "robbd86/automation-outlet-orders");
  assert.equal(idempotencyKey, `ao-live-webhook-v1-${sessionId}`);
  assert.match(orderIssue.title, /NEW AO ORDER/);

  const duplicate = await invoke({ ...event(), id: "evt_live_repeat" });
  assert.equal(duplicate.code, 200);
  assert.equal(duplicate.body.duplicate, true);
  assert.equal(comments.length, 2);
});

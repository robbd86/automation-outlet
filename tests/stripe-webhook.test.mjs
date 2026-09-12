import test, { beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import webhook from "../api/stripe-webhook.mjs";

const secret = "whsec_unit_test_only";
const sessionId = "cs_test_ao123";
const acknowledgement = { ao_webhook_status: "paid_test_acknowledged_v1", ao_stock_action: "unchanged" };
let oldFetch, oldKey, oldSecret, calls;
const paidSession = () => ({
  id: sessionId, object: "checkout.session", livemode: false, mode: "payment",
  status: "complete", payment_status: "paid", amount_total: 15665, currency: "gbp",
  metadata: { ao_environment: "sandbox", ao_line_count: "1" },
});
const event = () => ({ id: "evt_test_1", type: "checkout.session.completed", livemode: false, data: { object: paidSession() } });
function request(value = event(), options = {}) {
  const body = typeof value === "string" ? value : JSON.stringify(value);
  const timestamp = options.timestamp ?? Math.floor(Date.now() / 1000);
  const digest = createHmac("sha256", options.secret || secret).update(`${timestamp}.${body}`).digest("hex");
  return new Request("https://ao.example/api/stripe-webhook", {
    method: "POST", body: options.body ?? body,
    headers: { "Content-Type": "application/json", "stripe-signature": options.signature ?? `t=${timestamp},v1=${digest}`, ...options.headers },
  });
}
async function invoke(value, options) {
  const response = await webhook.fetch(request(value, options));
  return { code: response.status, body: await response.json(), headers: response.headers };
}
function mockStripe(impl) {
  global.fetch = async (url, options) => {
    assert.equal(url, `https://api.stripe.com/v1/checkout/sessions/${sessionId}`);
    assert.equal(options.headers.Authorization, "Bearer sk_test_unit_test_only");
    assert.ok(options.signal);
    calls.push({ url, ...options });
    return impl(url, options);
  };
}
beforeEach(() => {
  oldFetch = global.fetch;
  oldKey = process.env.STRIPE_SECRET_KEY;
  oldSecret = process.env.STRIPE_WEBHOOK_SECRET;
  process.env.STRIPE_SECRET_KEY = "sk_test_unit_test_only";
  process.env.STRIPE_WEBHOOK_SECRET = secret;
  calls = [];
  global.fetch = async () => { throw new Error("Unexpected network request"); };
});
afterEach(() => {
  global.fetch = oldFetch;
  if (oldKey === undefined) delete process.env.STRIPE_SECRET_KEY; else process.env.STRIPE_SECRET_KEY = oldKey;
  if (oldSecret === undefined) delete process.env.STRIPE_WEBHOOK_SECRET; else process.env.STRIPE_WEBHOOK_SECRET = oldSecret;
});

test("rejects unsupported HTTP methods without touching Stripe", async () => {
  for (const method of ["GET", "PUT", "DELETE", "OPTIONS"]) {
    const response = await webhook.fetch(new Request("https://ao.example/api/stripe-webhook", { method }));
    assert.equal(response.status, 405);
    assert.equal(response.headers.get("allow"), "POST");
  }
});
test("fails closed for missing or live credentials", async () => {
  for (const key of ["", "sk_live_not_allowed", "rk_live_not_allowed"]) {
    process.env.STRIPE_SECRET_KEY = key;
    assert.equal((await invoke()).code, 503);
  }
  process.env.STRIPE_SECRET_KEY = "sk_test_unit_test_only";
  delete process.env.STRIPE_WEBHOOK_SECRET;
  assert.equal((await invoke()).code, 503);
});
test("rejects missing, malformed, wrong-secret, stale and tampered signatures", async () => {
  for (const options of [
    { signature: "" }, { signature: "garbage" }, { secret: "whsec_wrong" },
    { timestamp: Math.floor(Date.now() / 1000) - 301 }, { body: `${JSON.stringify(event())} ` },
  ]) assert.equal((await invoke(event(), options)).code, 400);
});
test("rejects oversized bodies, including without an advertised content length", async () => {
  assert.equal((await invoke(event(), { headers: { "content-length": "1048577" } })).code, 413);
  assert.equal((await invoke(" ".repeat(1048577))).code, 413);
});
test("rejects malformed signed JSON and missing event type", async () => {
  for (const value of ["{bad", "null", "{}", "[]"]) assert.equal((await invoke(value)).code, 400);
});
test("acknowledges unsupported test events without processing them", async () => {
  const value = event(); value.type = "payment_intent.succeeded";
  assert.deepEqual((await invoke(value)).body, { received: true, ignored: true });
});
test("rejects live, unscoped and connected-account events", async () => {
  for (const patch of [{ livemode: true }, { livemode: undefined }, { account: "acct_other" }, { context: "acct_other" }]) {
    assert.equal((await invoke({ ...event(), ...patch })).code, 400);
  }
});
test("rejects live or malformed sessions before accessing Stripe", async () => {
  for (const patch of [{ livemode: true }, { id: "cs_live_123" }, { id: "../../stock" }, { object: "payment_intent" }]) {
    const value = event(); Object.assign(value.data.object, patch);
    assert.equal((await invoke(value)).code, 400);
  }
});
test("ignores non-AO sessions, unpaid completions and non-payment mode", async () => {
  for (const patch of [{ metadata: {} }, { payment_status: "unpaid" }, { payment_status: "no_payment_required" }, { status: "open" }, { mode: "subscription" }]) {
    const value = event(); Object.assign(value.data.object, patch);
    const result = await invoke(value);
    assert.equal(result.code, 200); assert.equal(result.body.ignored, true);
  }
});
test("independently signed raw bytes and multiple v1 signatures are accepted", async () => {
  mockStripe(() => Response.json({ ...paidSession(), metadata: { ...paidSession().metadata, ...acknowledgement } }));
  const body = JSON.stringify(event(), null, 2).replace('"evt_test_1"', '"evt_test_£"');
  const req = request(body);
  req.headers.set("stripe-signature", `${req.headers.get("stripe-signature")},v1=${"0".repeat(64)}`);
  assert.equal((await webhook.fetch(req)).status, 200);
});
test("persists acknowledgement on the existing session and preserves stock and other metadata", async () => {
  const stored = paidSession();
  mockStripe((_url, options) => {
    if (options.method === "POST") {
      assert.equal(options.headers["Idempotency-Key"], `ao-test-webhook-v2-${sessionId}`);
      const params = Object.fromEntries(new URLSearchParams(options.body));
      assert.deepEqual(params, {
        "metadata[ao_webhook_status]": acknowledgement.ao_webhook_status,
        "metadata[ao_stock_action]": "unchanged",
      });
      Object.assign(stored.metadata, acknowledgement);
    }
    return Response.json(stored);
  });
  const first = await invoke();
  assert.deepEqual(first.body, { received: true, sandbox: true, recorded: true, stockChanged: false });
  assert.equal(first.headers.get("cache-control"), "no-store");
  assert.equal(calls.length, 2);
  // A second Event object for the SAME session must also deduplicate.
  const second = await invoke({ ...event(), id: "evt_test_2" });
  assert.equal(second.body.duplicate, true);
  assert.equal(calls.filter(c => c.method === "POST").length, 1);
  assert.equal(stored.metadata.ao_line_count, "1");
});
test("concurrent deliveries converge on one record with identical idempotency keys and bodies", async () => {
  const writes = [];
  mockStripe(async (_url, options) => {
    if (options.method !== "POST") return Response.json(paidSession());
    writes.push(options);
    return Response.json({ ...paidSession(), metadata: { ...paidSession().metadata, ...acknowledgement } });
  });
  const responses = await Promise.all(Array.from({ length: 8 }, (_, n) => invoke({ ...event(), id: `evt_${n}` })));
  assert.ok(responses.every(r => r.code === 200 && r.body.stockChanged === false));
  assert.equal(writes.length, 8);
  assert.equal(new Set(writes.map(w => w.headers["Idempotency-Key"])).size, 1);
  assert.equal(new Set(writes.map(w => w.body)).size, 1);
  assert.equal(new Set(calls.map(c => c.url)).size, 1);
});
test("rejects discrepancies in the server-side Stripe session without writing", async () => {
  for (const patch of [{ id: "cs_test_other" }, { livemode: true }, { object: "other" }, { status: "open" }, { payment_status: "unpaid" }, { metadata: {} }, { mode: "subscription" }]) {
    mockStripe(() => Response.json({ ...paidSession(), ...patch }));
    assert.equal((await invoke()).code, 502);
  }
  assert.ok(calls.every(c => c.method !== "POST"));
});
test("read failures return retryable errors without exposing upstream information", async () => {
  for (const status of [401, 404, 429, 500]) {
    mockStripe(() => Response.json({ error: { message: "private customer details and secret" } }, { status }));
    const result = await invoke();
    assert.equal(result.code, 503);
    assert.doesNotMatch(JSON.stringify(result.body), /private|customer|sk_test|whsec/);
  }
});
test("failed writes and concurrent-key conflicts remain retryable", async () => {
  for (const status of [400, 409, 429, 500]) {
    mockStripe((_url, options) => options.method === "POST" ? Response.json({}, { status }) : Response.json(paidSession()));
    assert.equal((await invoke()).code, 503);
  }
});
test("does not acknowledge a successful HTTP write unless the stored marker is confirmed", async () => {
  mockStripe(() => Response.json(paidSession()));
  assert.equal((await invoke()).code, 503);
});
test("recovers after a write succeeds but its response is lost", async () => {
  const stored = paidSession();
  mockStripe((_url, options) => {
    if (options.method === "POST") {
      Object.assign(stored.metadata, acknowledgement);
      throw new Error("network timeout with private upstream details");
    }
    return Response.json(stored);
  });
  assert.equal((await invoke()).code, 503);
  assert.equal((await invoke()).body.duplicate, true);
  assert.equal(calls.filter(c => c.method === "POST").length, 1);
});

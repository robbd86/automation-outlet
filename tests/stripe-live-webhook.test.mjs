import test, { beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import webhook from "../api/stripe-webhook.mjs";

const signingSecret = "whsec_live_commissioning_test";
let oldSecret, oldSandboxSecret, oldSandboxKey;

function request(event, options = {}) {
  const body = JSON.stringify(event);
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

beforeEach(() => {
  oldSecret = process.env.STRIPE_LIVE_WEBHOOK_SECRET;
  oldSandboxSecret = process.env.STRIPE_WEBHOOK_SECRET;
  oldSandboxKey = process.env.STRIPE_SECRET_KEY;
  process.env.STRIPE_LIVE_WEBHOOK_SECRET = signingSecret;
  delete process.env.STRIPE_WEBHOOK_SECRET;
  delete process.env.STRIPE_SECRET_KEY;
});

afterEach(() => {
  if (oldSecret === undefined) delete process.env.STRIPE_LIVE_WEBHOOK_SECRET;
  else process.env.STRIPE_LIVE_WEBHOOK_SECRET = oldSecret;
  if (oldSandboxSecret === undefined) delete process.env.STRIPE_WEBHOOK_SECRET;
  else process.env.STRIPE_WEBHOOK_SECRET = oldSandboxSecret;
  if (oldSandboxKey === undefined) delete process.env.STRIPE_SECRET_KEY;
  else process.env.STRIPE_SECRET_KEY = oldSandboxKey;
});

test("live webhook commissioning endpoint verifies Stripe signatures without processing orders", async () => {
  const response = await webhook.fetch(request({
    id: "evt_live_test",
    type: "checkout.session.completed",
    livemode: true,
    data: { object: { id: "cs_live_test", object: "checkout.session" } },
  }));
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.received, true);
  assert.equal(body.liveWebhook, true);
  assert.equal(body.commissioning, true);
  assert.equal(body.eventType, "checkout.session.completed");
  assert.equal(body.livemode, true);
});

test("live webhook commissioning endpoint rejects an invalid signature", async () => {
  const response = await webhook.fetch(request(
    { id: "evt_bad", type: "checkout.session.completed", livemode: true },
    { secret: "whsec_wrong" },
  ));
  assert.equal(response.status, 400);
});

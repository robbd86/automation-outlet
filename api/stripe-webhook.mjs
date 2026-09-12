import Stripe from "stripe";
import { appendInventoryEvent, listInventoryEvents, reservationStates } from "../lib/inventory-ledger.mjs";
import { createOrFindOrderNotification, orderRepoName } from "../lib/order-notification.mjs";

const MAX_BODY_BYTES = 1024 * 1024;
const LEGACY_ACKNOWLEDGEMENT = Object.freeze({
  ao_webhook_status: "paid_test_acknowledged_v1",
  ao_stock_action: "unchanged",
});
const INVENTORY_ACKNOWLEDGEMENT = Object.freeze({
  ao_webhook_status: "paid_test_acknowledged_v2",
  ao_stock_action: "reduced",
  ao_order_status: "awaiting_dispatch",
});

function json(status, body, headers = {}) {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "no-store", ...headers },
  });
}

async function rawBody(request) {
  if (Number(request.headers.get("content-length")) > MAX_BODY_BYTES) throw new Error("body_limit");
  const chunks = [];
  let size = 0;
  if (request.body) {
    for await (const chunk of request.body) {
      size += chunk.byteLength;
      if (size > MAX_BODY_BYTES) throw new Error("body_limit");
      chunks.push(Buffer.from(chunk));
    }
  }
  return Buffer.concat(chunks);
}

function isAcknowledged(session, acknowledgement) {
  return Object.entries(acknowledgement).every(([key, value]) => session.metadata?.[key] === value);
}

async function stripeRequest(sessionId, secret, options = {}) {
  const result = await fetch(`https://api.stripe.com/v1/checkout/sessions/${encodeURIComponent(sessionId)}`, {
    ...options,
    headers: { Authorization: `Bearer ${secret}`, ...options.headers },
    signal: AbortSignal.timeout(8000),
  });
  if (!result.ok) throw new Error("stripe_request_failed");
  return result.json();
}

async function stripeOrderDetail(sessionId, secret) {
  const params = new URLSearchParams();
  params.append("expand[]", "line_items.data.price.product");
  const result = await fetch(`https://api.stripe.com/v1/checkout/sessions/${encodeURIComponent(sessionId)}?${params.toString()}`, {
    headers: { Authorization: `Bearer ${secret}` },
    signal: AbortSignal.timeout(8000),
  });
  if (!result.ok) throw new Error("stripe_order_detail_failed");
  return result.json();
}

// A Web Standard handler keeps the original bytes; never reconstruct JSON for verification.
export default {
  async fetch(request) {
    if (request.method !== "POST") return json(405, { error: "Method not allowed" }, { Allow: "POST" });
    const secret = process.env.STRIPE_SECRET_KEY || "";
    const signingSecret = process.env.STRIPE_WEBHOOK_SECRET || "";
    if (!secret.startsWith("sk_test_") || !signingSecret.startsWith("whsec_")) {
      return json(503, { error: "Sandbox webhook is not configured." });
    }

    const signature = request.headers.get("stripe-signature");
    if (!signature) return json(400, { error: "Invalid webhook signature." });
    let event;
    try {
      const body = await rawBody(request);
      // Stripe verifies the HMAC and rejects signatures older than five minutes.
      event = Stripe.webhooks.constructEvent(body, signature, signingSecret, 300);
    } catch (error) {
      return json(error?.message === "body_limit" ? 413 : 400, { error: "Invalid webhook payload or signature." });
    }

    if (!event || typeof event !== "object" || typeof event.type !== "string") {
      return json(400, { error: "Invalid webhook event." });
    }
    if (event.livemode !== false || event.account || event.context) {
      return json(400, { error: "Only own-account sandbox events are accepted." });
    }
    if (event.type !== "checkout.session.completed") return json(200, { received: true, ignored: true });

    const incoming = event.data?.object;
    if (incoming?.object !== "checkout.session" || incoming.livemode !== false ||
        !/^cs_test_[A-Za-z0-9_]+$/.test(incoming.id || "")) {
      return json(400, { error: "Invalid sandbox checkout session." });
    }
    if (incoming.metadata?.ao_environment !== "sandbox" || incoming.mode !== "payment") {
      return json(200, { received: true, ignored: true });
    }
    if (incoming.payment_status !== "paid" || incoming.status !== "complete") {
      return json(200, { received: true, ignored: true, reason: "not_paid" });
    }

    try {
      // Re-read from Stripe with the test key before acknowledging a paid AO session.
      const session = await stripeRequest(incoming.id, secret);
      if (session.id !== incoming.id || session.object !== "checkout.session" || session.livemode !== false ||
          session.mode !== "payment" || session.status !== "complete" || session.payment_status !== "paid" ||
          session.metadata?.ao_environment !== "sandbox") {
        return json(502, { error: "Could not verify the paid AO sandbox session." });
      }

      const reservationId = String(session.metadata?.ao_reservation_id || "");
      const acknowledgement = reservationId ? INVENTORY_ACKNOWLEDGEMENT : LEGACY_ACKNOWLEDGEMENT;
      if (isAcknowledged(session, acknowledgement)) {
        return json(200, {
          received: true,
          sandbox: true,
          duplicate: true,
          stockChanged: Boolean(reservationId),
        });
      }

      if (reservationId) {
        const states = reservationStates(await listInventoryEvents());
        const state = states.get(reservationId);
        if (!state || !["reserve", "paid"].includes(state.kind)) {
          return json(503, { error: "Inventory reservation unavailable; retry delivery." });
        }
        if (state.kind !== "paid") {
          await appendInventoryEvent({
            kind: "paid",
            reservationId,
            sessionId: session.id,
            eventId: event.id,
            items: state.items,
          });
        }
      }

      let orderIssue = null;
      if (reservationId) {
        const detail = await stripeOrderDetail(session.id, secret);
        orderIssue = await createOrFindOrderNotification(detail);
      }

      const body = new URLSearchParams(Object.entries(acknowledgement).map(([key, value]) => [`metadata[${key}]`, value]));
      if (orderIssue?.number) {
        body.set("metadata[ao_order_issue]", String(orderIssue.number));
        body.set("metadata[ao_order_repo]", orderRepoName());
      }
      const updated = await stripeRequest(session.id, secret, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "Idempotency-Key": `ao-test-webhook-v2-${session.id}`,
        },
        body: body.toString(),
      });
      if (updated.id !== session.id || updated.livemode !== false || !isAcknowledged(updated, acknowledgement)) {
        throw new Error("acknowledgement_not_confirmed");
      }
      return json(200, {
        received: true,
        sandbox: true,
        recorded: true,
        stockChanged: Boolean(reservationId),
        notificationCreated: Boolean(orderIssue?.number),
      });
    } catch {
      // Includes timeouts, API failures and overlapping idempotency-key requests: let Stripe retry.
      // Do not log the payload, signature, customer details, tokens or upstream error messages.
      return json(503, { error: "Sandbox acknowledgement unavailable; retry delivery." });
    }
  },
};

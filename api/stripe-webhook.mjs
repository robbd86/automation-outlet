import Stripe from "stripe";
import { appendInventoryEvent, listInventoryEvents, reservationStates } from "../lib/inventory-ledger.mjs";
import { createOrFindOrderNotification, orderRepoName, updateOrderNotificationRefundStatus } from "../lib/order-notification.mjs";

const MAX_BODY_BYTES = 1024 * 1024;

const SANDBOX_LEGACY_ACKNOWLEDGEMENT = Object.freeze({
  ao_webhook_status: "paid_test_acknowledged_v1",
  ao_stock_action: "unchanged",
});
const SANDBOX_INVENTORY_ACKNOWLEDGEMENT = Object.freeze({
  ao_webhook_status: "paid_test_acknowledged_v2",
  ao_stock_action: "reduced",
  ao_order_status: "awaiting_dispatch",
});
const LIVE_INVENTORY_ACKNOWLEDGEMENT = Object.freeze({
  ao_webhook_status: "paid_live_acknowledged_v1",
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


async function stripeSessionByPaymentIntent(paymentIntentId, secret) {
  const params = new URLSearchParams({ payment_intent: paymentIntentId, limit: "1" });
  const result = await fetch(`https://api.stripe.com/v1/checkout/sessions?${params.toString()}`, {
    headers: { Authorization: `Bearer ${secret}` },
    signal: AbortSignal.timeout(8000),
  });
  if (!result.ok) throw new Error("stripe_session_lookup_failed");
  const data = await result.json();
  return Array.isArray(data?.data) ? data.data[0] || null : null;
}

async function updateStripeSessionMetadata(sessionId, secret, values, idempotencyKey) {
  const body = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) body.set(`metadata[${key}]`, String(value));
  return stripeRequest(sessionId, secret, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "Idempotency-Key": idempotencyKey,
    },
    body: body.toString(),
  });
}

async function processExpiredCheckout(event, channel, secret) {
  const isLive = channel === "live";
  const environment = isLive ? "live" : "sandbox";
  const session = event.data?.object;
  if (session?.object !== "checkout.session" ||
      Boolean(session.livemode) !== isLive ||
      session.metadata?.ao_environment !== environment ||
      session.mode !== "payment") {
    return json(200, { received: true, ignored: true });
  }

  const reservationId = String(session.metadata?.ao_reservation_id || "");
  if (!reservationId) return json(200, { received: true, ignored: true, reason: "no_reservation" });

  try {
    const states = reservationStates(await listInventoryEvents());
    const state = states.get(reservationId);
    if (state?.kind === "reserve") {
      await appendInventoryEvent({
        kind: "release",
        reservationId,
        sessionId: session.id,
        eventId: event.id,
        items: state.items,
      });
    }
    await updateStripeSessionMetadata(session.id, secret, {
      ao_stock_action: "released",
      ao_order_status: "expired",
    }, `ao-expired-v1-${session.id}`).catch(() => {});

    return json(200, {
      received: true,
      expired: true,
      stockReleased: state?.kind === "reserve",
    });
  } catch {
    return json(503, { error: "Checkout expiry release unavailable; retry delivery." });
  }
}

async function processRefundedCharge(event, channel, secret) {
  const isLive = channel === "live";
  const environment = isLive ? "live" : "sandbox";
  const charge = event.data?.object;
  const paymentIntentId = typeof charge?.payment_intent === "string" ? charge.payment_intent : charge?.payment_intent?.id;

  if (charge?.object !== "charge" || Boolean(charge.livemode) !== isLive || !/^pi_[A-Za-z0-9_]+$/.test(String(paymentIntentId || ""))) {
    return json(200, { received: true, ignored: true });
  }

  try {
    let session = await stripeSessionByPaymentIntent(paymentIntentId, secret);
    if (!session ||
        Boolean(session.livemode) !== isLive ||
        session.mode !== "payment" ||
        session.metadata?.ao_environment !== environment) {
      return json(200, { received: true, ignored: true, reason: "not_ao_checkout" });
    }

    session = await stripeRequest(session.id, secret);
    const amount = Math.max(0, Number(charge.amount) || 0);
    const amountRefunded = Math.max(0, Number(charge.amount_refunded) || 0);
    const full = Boolean(charge.refunded) || (amount > 0 && amountRefunded >= amount);
    const previousOrderStatus = String(session.metadata?.ao_order_status || "");
    const reservationId = String(session.metadata?.ao_reservation_id || "");
    const dispatched = previousOrderStatus === "dispatched";
    let restocked = false;

    if (full && reservationId && !dispatched) {
      const states = reservationStates(await listInventoryEvents());
      const state = states.get(reservationId);
      if (state?.kind === "paid") {
        await appendInventoryEvent({
          kind: "release",
          reservationId,
          sessionId: session.id,
          eventId: event.id,
          items: state.items,
        });
        restocked = true;
      } else if (state?.kind === "release") {
        restocked = true;
      }
    }

    let orderIssue = Number(session.metadata?.ao_order_issue || 0) || 0;
    let orderRepo = String(session.metadata?.ao_order_repo || "") || orderRepoName();
    if (!orderIssue && reservationId) {
      const detail = await stripeOrderDetail(session.id, secret);
      const issue = await createOrFindOrderNotification(detail);
      orderIssue = Number(issue?.number || 0) || 0;
      orderRepo = orderRepoName();
    }

    if (orderIssue) {
      await updateOrderNotificationRefundStatus(orderIssue, {
        full,
        amountRefunded,
        currency: charge.currency || session.currency || "gbp",
        restocked,
        eventId: event.id,
      }, orderRepo);
    }

    const orderStatus = full ? "refunded" : "partially_refunded";
    const stockAction = restocked ? "restocked" : (full ? "refund_review" : "unchanged_partial_refund");
    const updated = await updateStripeSessionMetadata(session.id, secret, {
      ao_order_status: orderStatus,
      ao_stock_action: stockAction,
      ao_refunded_pence: amountRefunded,
      ao_refund_event: event.id,
      ...(orderIssue ? { ao_order_issue: orderIssue, ao_order_repo: orderRepo } : {}),
    }, `ao-refund-v1-${event.id}`);

    if (updated.metadata?.ao_order_status !== orderStatus ||
        updated.metadata?.ao_refunded_pence !== String(amountRefunded)) {
      throw new Error("refund_metadata_not_confirmed");
    }

    return json(200, {
      received: true,
      refunded: true,
      full,
      amountRefunded,
      restocked,
      requiresStockReview: full && !restocked,
      orderUpdated: Boolean(orderIssue),
    });
  } catch {
    return json(503, { error: "Refund handling unavailable; retry delivery." });
  }
}

async function processPaidCheckout(event, channel, secret) {
  const isLive = channel === "live";
  const environment = isLive ? "live" : "sandbox";
  const incoming = event.data?.object;
  const sessionPattern = isLive ? /^cs_live_[A-Za-z0-9_]+$/ : /^cs_test_[A-Za-z0-9_]+$/;

  if (incoming?.object !== "checkout.session" ||
      Boolean(incoming.livemode) !== isLive ||
      !sessionPattern.test(incoming.id || "")) {
    return json(400, { error: `Invalid ${environment} checkout session.` });
  }

  if (incoming.metadata?.ao_environment !== environment || incoming.mode !== "payment") {
    return json(200, { received: true, ignored: true });
  }
  if (incoming.payment_status !== "paid" || incoming.status !== "complete") {
    return json(200, { received: true, ignored: true, reason: "not_paid" });
  }

  try {
    const session = await stripeRequest(incoming.id, secret);
    if (session.id !== incoming.id ||
        session.object !== "checkout.session" ||
        Boolean(session.livemode) !== isLive ||
        session.mode !== "payment" ||
        session.status !== "complete" ||
        session.payment_status !== "paid" ||
        session.metadata?.ao_environment !== environment) {
      return json(502, { error: `Could not verify the paid AO ${environment} session.` });
    }

    const reservationId = String(session.metadata?.ao_reservation_id || "");
    if (isLive && !reservationId) {
      return json(503, { error: "Live inventory reservation unavailable; retry delivery." });
    }

    const acknowledgement = isLive
      ? LIVE_INVENTORY_ACKNOWLEDGEMENT
      : (reservationId ? SANDBOX_INVENTORY_ACKNOWLEDGEMENT : SANDBOX_LEGACY_ACKNOWLEDGEMENT);

    if (isAcknowledged(session, acknowledgement)) {
      return json(200, {
        received: true,
        ...(isLive ? { live: true, sandbox: false } : { sandbox: true }),
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

    const updateBody = new URLSearchParams(
      Object.entries(acknowledgement).map(([key, value]) => [`metadata[${key}]`, value])
    );
    if (orderIssue?.number) {
      updateBody.set("metadata[ao_order_issue]", String(orderIssue.number));
      updateBody.set("metadata[ao_order_repo]", orderRepoName());
    }

    const updated = await stripeRequest(session.id, secret, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Idempotency-Key": `${isLive ? "ao-live-webhook-v1" : "ao-test-webhook-v2"}-${session.id}`,
      },
      body: updateBody.toString(),
    });

    if (updated.id !== session.id ||
        Boolean(updated.livemode) !== isLive ||
        !isAcknowledged(updated, acknowledgement)) {
      throw new Error("acknowledgement_not_confirmed");
    }

    return json(200, {
      received: true,
      ...(isLive ? { live: true, sandbox: false } : { sandbox: true }),
      recorded: true,
      stockChanged: Boolean(reservationId),
      notificationCreated: Boolean(orderIssue?.number),
    });
  } catch {
    return json(503, { error: `${isLive ? "Live" : "Sandbox"} acknowledgement unavailable; retry delivery.` });
  }
}

// Web Standard handler: signature verification must use the exact raw bytes Stripe sent.
export default {
  async fetch(request) {
    if (request.method !== "POST") return json(405, { error: "Method not allowed" }, { Allow: "POST" });

    const sandboxSecret = process.env.STRIPE_SECRET_KEY || "";
    const liveSecret = process.env.STRIPE_LIVE_SECRET_KEY || "";
    const sandboxSigningSecret = process.env.STRIPE_WEBHOOK_SECRET || "";
    const liveSigningSecret = process.env.STRIPE_LIVE_WEBHOOK_SECRET || "";

    const sandboxConfigured = sandboxSecret.startsWith("sk_test_") && sandboxSigningSecret.startsWith("whsec_");
    const liveConfigured = liveSecret.startsWith("sk_live_") && liveSigningSecret.startsWith("whsec_");
    if (!sandboxConfigured && !liveConfigured) {
      return json(503, { error: "Stripe webhook is not configured." });
    }

    const signature = request.headers.get("stripe-signature");
    if (!signature) return json(400, { error: "Invalid webhook signature." });

    let body;
    try {
      body = await rawBody(request);
    } catch (error) {
      return json(error?.message === "body_limit" ? 413 : 400, { error: "Invalid webhook payload or signature." });
    }

    let event = null;
    let channel = "";
    for (const [name, signingSecret] of [
      ["sandbox", sandboxConfigured ? sandboxSigningSecret : ""],
      ["live", liveConfigured ? liveSigningSecret : ""],
    ]) {
      if (!signingSecret) continue;
      try {
        event = Stripe.webhooks.constructEvent(body, signature, signingSecret, 300);
        channel = name;
        break;
      } catch {}
    }

    if (!event || typeof event !== "object" || typeof event.type !== "string") {
      return json(400, { error: "Invalid webhook payload or signature." });
    }

    const isLive = channel === "live";
    if (event.livemode !== isLive || event.account || event.context) {
      return json(400, { error: `Only own-account ${isLive ? "live" : "sandbox"} events are accepted.` });
    }

    const stripeSecret = isLive ? liveSecret : sandboxSecret;
    if (event.type === "checkout.session.completed") {
      return processPaidCheckout(event, channel, stripeSecret);
    }
    if (event.type === "checkout.session.expired") {
      return processExpiredCheckout(event, channel, stripeSecret);
    }
    if (event.type === "charge.refunded") {
      return processRefundedCharge(event, channel, stripeSecret);
    }
    return json(200, { received: true, ignored: true });
  },
};

import Stripe from "stripe";

const MAX_BODY_BYTES = 1024 * 1024;

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

export default {
  async fetch(request) {
    if (request.method !== "POST") return json(405, { error: "Method not allowed" }, { Allow: "POST" });

    const signingSecret = process.env.STRIPE_LIVE_WEBHOOK_SECRET || "";
    if (!signingSecret.startsWith("whsec_")) {
      return json(503, { error: "Live webhook signing secret is not configured." });
    }

    const signature = request.headers.get("stripe-signature");
    if (!signature) return json(400, { error: "Invalid webhook signature." });

    let event;
    try {
      const body = await rawBody(request);
      event = Stripe.webhooks.constructEvent(body, signature, signingSecret, 300);
    } catch (error) {
      return json(error?.message === "body_limit" ? 413 : 400, { error: "Invalid webhook payload or signature." });
    }

    if (!event || typeof event !== "object" || typeof event.type !== "string") {
      return json(400, { error: "Invalid webhook event." });
    }

    // Commissioning mode only: prove Stripe can reach and sign the endpoint.
    // No payment, stock or order state is changed by this endpoint yet.
    return json(200, {
      received: true,
      liveWebhook: true,
      commissioning: true,
      eventType: event.type,
      livemode: Boolean(event.livemode),
    });
  },
};

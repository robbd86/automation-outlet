function json(response, status, body) {
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("Cache-Control", "no-store");
  return response.status(status).json(body);
}

export default async function handler(request, response) {
  if (request.method !== "GET") {
    response.setHeader("Allow", "GET");
    return json(response, 405, { error: "Method not allowed" });
  }

  const sessionId = String(request.query?.session_id || "").trim();
  const isSandbox = /^cs_test_[A-Za-z0-9_]+$/.test(sessionId);
  const isLive = /^cs_live_[A-Za-z0-9_]+$/.test(sessionId);
  if (!isSandbox && !isLive) {
    return json(response, 400, { error: "Invalid Stripe session." });
  }

  const environment = isLive ? "live" : "sandbox";
  const secret = isLive
    ? (process.env.STRIPE_LIVE_SECRET_KEY || "")
    : (process.env.STRIPE_SECRET_KEY || "");

  if (isLive && !secret.startsWith("sk_live_")) {
    return json(response, 503, { error: "Stripe live verification is not configured." });
  }
  if (isSandbox && !secret.startsWith("sk_test_")) {
    return json(response, 503, { error: "Stripe sandbox verification is not configured." });
  }

  try {
    const stripe = await fetch(`https://api.stripe.com/v1/checkout/sessions/${encodeURIComponent(sessionId)}?expand[]=line_items`, {
      headers: { Authorization: `Bearer ${secret}` },
    });
    const session = await stripe.json().catch(() => ({}));
    if (!stripe.ok) {
      console.error("Stripe session verification failed", environment, stripe.status, session?.error?.type, session?.error?.code);
      return json(response, 502, { error: "Could not verify the Stripe session." });
    }

    if (Boolean(session.livemode) !== isLive || session.metadata?.ao_environment !== environment) {
      return json(response, 502, { error: "Stripe session environment did not match the expected AO checkout." });
    }
    if (isLive && session.metadata?.ao_commissioning !== "true") {
      return json(response, 403, { error: "This live session is not an AO commissioning checkout." });
    }

    const paid = session.payment_status === "paid";
    const items = Array.isArray(session.line_items?.data)
      ? session.line_items.data.map((item) => ({
          description: item.description,
          quantity: item.quantity,
          amountTotal: item.amount_total,
          currency: item.currency,
        }))
      : [];

    const marker = String(session.metadata?.ao_webhook_status || "");
    const webhookAcknowledged = isLive
      ? /^paid_live_acknowledged_v[12]$/.test(marker)
      : /^paid_test_acknowledged_v[12]$/.test(marker);

    return json(response, 200, {
      paid,
      paymentStatus: session.payment_status,
      status: session.status,
      amountTotal: session.amount_total,
      currency: session.currency,
      customerEmail: session.customer_details?.email || null,
      customerName: session.customer_details?.name || null,
      items,
      webhookAcknowledged,
      stockAction: session.metadata?.ao_stock_action || "pending",
      orderStatus: session.metadata?.ao_order_status || "pending",
      sandbox: isSandbox,
      live: isLive,
      commissioning: isLive && session.metadata?.ao_commissioning === "true",
      environment,
    });
  } catch (error) {
    console.error("Stripe verification error", environment, error?.message || error);
    return json(response, 500, { error: "Could not verify the Stripe payment." });
  }
}

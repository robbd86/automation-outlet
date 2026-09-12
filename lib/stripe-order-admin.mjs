function json(response, status, body) {
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("Cache-Control", "no-store");
  return response.status(status).json(body);
}

function clean(value, max = 180) {
  return String(value ?? "").trim().slice(0, max);
}

export async function updateSandboxOrderStatus(request, response, authorised) {
  if (!authorised) return json(response, 401, { error: "Invalid order manager key" });

  const secret = process.env.STRIPE_SECRET_KEY || "";
  if (!secret.startsWith("sk_test_")) {
    return json(response, 503, { error: "Stripe sandbox orders are not configured." });
  }

  const sessionId = clean(request.body?.sessionId);
  const orderStatus = clean(request.body?.orderStatus, 40);
  if (!/^cs_test_[A-Za-z0-9_]+$/.test(sessionId)) {
    return json(response, 400, { error: "Invalid sandbox order." });
  }
  if (!["awaiting_dispatch", "dispatched"].includes(orderStatus)) {
    return json(response, 400, { error: "Invalid order status." });
  }

  const sessionResponse = await fetch(`https://api.stripe.com/v1/checkout/sessions/${encodeURIComponent(sessionId)}`, {
    headers: { Authorization: `Bearer ${secret}` },
    signal: AbortSignal.timeout(8000),
  });
  const session = await sessionResponse.json().catch(() => ({}));
  if (!sessionResponse.ok || session.livemode !== false ||
      session.metadata?.ao_environment !== "sandbox" ||
      session.payment_status !== "paid" || session.status !== "complete") {
    return json(response, 409, { error: "Only verified paid AO sandbox orders can be updated." });
  }

  const params = new URLSearchParams();
  params.set("metadata[ao_order_status]", orderStatus);
  const updateResponse = await fetch(`https://api.stripe.com/v1/checkout/sessions/${encodeURIComponent(sessionId)}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${secret}`,
      "Content-Type": "application/x-www-form-urlencoded",
      "Idempotency-Key": `ao-order-status-${sessionId}-${orderStatus}`,
    },
    body: params.toString(),
    signal: AbortSignal.timeout(8000),
  });
  const updated = await updateResponse.json().catch(() => ({}));
  if (!updateResponse.ok || updated.metadata?.ao_order_status !== orderStatus) {
    return json(response, 502, { error: "Could not update the sandbox order status." });
  }
  return json(response, 200, { sessionId, orderStatus, sandbox: true });
}

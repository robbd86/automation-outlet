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

  const secret = process.env.STRIPE_SECRET_KEY || "";
  if (!secret.startsWith("sk_test_")) {
    return json(response, 503, { error: "Stripe sandbox verification is not configured." });
  }

  const sessionId = String(request.query?.session_id || "").trim();
  if (!/^cs_test_[A-Za-z0-9_]+$/.test(sessionId)) {
    return json(response, 400, { error: "Invalid sandbox session." });
  }

  try {
    const stripe = await fetch(`https://api.stripe.com/v1/checkout/sessions/${encodeURIComponent(sessionId)}?expand[]=line_items`, {
      headers: { Authorization: `Bearer ${secret}` },
    });
    const session = await stripe.json().catch(() => ({}));
    if (!stripe.ok) {
      console.error("Stripe session verification failed", stripe.status, session?.error?.type, session?.error?.code);
      return json(response, 502, { error: "Could not verify the Stripe session." });
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

    return json(response, 200, {
      paid,
      paymentStatus: session.payment_status,
      status: session.status,
      amountTotal: session.amount_total,
      currency: session.currency,
      customerEmail: session.customer_details?.email || null,
      customerName: session.customer_details?.name || null,
      items,
      sandbox: true,
    });
  } catch (error) {
    console.error("Stripe sandbox verification error", error?.message || error);
    return json(response, 500, { error: "Could not verify the Stripe payment." });
  }
}

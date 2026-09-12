import crypto from "node:crypto";

function json(response, status, body) {
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("Cache-Control", "no-store");
  return response.status(status).json(body);
}

function secureEqual(left, right) {
  const a = Buffer.from(String(left || ""));
  const b = Buffer.from(String(right || ""));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function requireAdmin(request) {
  const expected = process.env.AO_DEAL_DESK_KEY || "";
  const supplied = request.headers?.["x-deal-desk-key"] || request.headers?.get?.("x-deal-desk-key") || "";
  return Boolean(expected && secureEqual(supplied, expected));
}

function safeCustomer(session) {
  const customer = session.customer_details || {};
  return {
    name: customer.name || null,
    email: customer.email || null,
    phone: customer.phone || null,
  };
}

function safeShipping(session) {
  const shipping = session.collected_information?.shipping_details || session.shipping_details || null;
  if (!shipping) return null;
  return {
    name: shipping.name || null,
    address: shipping.address ? {
      line1: shipping.address.line1 || null,
      line2: shipping.address.line2 || null,
      city: shipping.address.city || null,
      postalCode: shipping.address.postal_code || null,
      country: shipping.address.country || null,
    } : null,
  };
}

function safeItems(session) {
  const lines = Array.isArray(session.line_items?.data) ? session.line_items.data : [];
  return lines.map((line) => {
    const product = line.price?.product && typeof line.price.product === "object" ? line.price.product : {};
    return {
      description: line.description || product.name || "Automation Outlet item",
      quantity: Number(line.quantity) || 0,
      amountTotal: Number(line.amount_total) || 0,
      currency: line.currency || session.currency || "gbp",
      partNumber: product.metadata?.part_number || null,
      stockId: product.metadata?.ao_stock_id || null,
    };
  });
}

export default async function handler(request, response) {
  if (request.method !== "GET") {
    response.setHeader("Allow", "GET");
    return json(response, 405, { error: "Method not allowed" });
  }
  if (!requireAdmin(request)) return json(response, 401, { error: "Invalid order manager key" });

  const secret = process.env.STRIPE_SECRET_KEY || "";
  if (!secret.startsWith("sk_test_")) {
    return json(response, 503, { error: "Stripe sandbox orders are not configured." });
  }

  const requestedLimit = Number.parseInt(request.query?.limit, 10);
  const limit = Number.isFinite(requestedLimit) ? Math.max(1, Math.min(100, requestedLimit)) : 50;
  const params = new URLSearchParams();
  params.set("limit", String(limit));
  params.append("expand[]", "data.line_items.data.price.product");

  try {
    const stripe = await fetch(`https://api.stripe.com/v1/checkout/sessions?${params.toString()}`, {
      headers: { Authorization: `Bearer ${secret}` },
      signal: AbortSignal.timeout(8000),
    });
    const payload = await stripe.json().catch(() => ({}));
    if (!stripe.ok) return json(response, 502, { error: "Could not load Stripe sandbox orders." });

    const sessions = Array.isArray(payload.data) ? payload.data : [];
    const orders = sessions
      .filter((session) => session?.metadata?.ao_environment === "sandbox" && session.mode === "payment")
      .map((session) => ({
        id: session.id,
        created: session.created,
        status: session.status,
        paymentStatus: session.payment_status,
        amountTotal: Number(session.amount_total) || 0,
        currency: session.currency || "gbp",
        customer: safeCustomer(session),
        shipping: safeShipping(session),
        items: safeItems(session),
        webhookAcknowledged: session.metadata?.ao_webhook_status === "paid_test_acknowledged_v1",
        stockAction: session.metadata?.ao_stock_action || "pending",
      }));

    return json(response, 200, { sandbox: true, orders });
  } catch {
    return json(response, 503, { error: "Stripe sandbox orders are temporarily unavailable." });
  }
}

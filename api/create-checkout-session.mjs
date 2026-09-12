import { appendInventoryEvent, listInventoryEvents, newReservationId, reservationIsAllocated } from "../lib/inventory-ledger.mjs";
import { listProducts } from "../lib/stock-read.mjs";
import { available, money, productSlug, publicProducts } from "../lib/shop.mjs";

function json(response, status, body) {
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("Cache-Control", "no-store");
  return response.status(status).json(body);
}

function parseBody(request) {
  if (!request.body) return {};
  if (typeof request.body === "object") return request.body;
  try { return JSON.parse(request.body); } catch { return {}; }
}

function siteOrigin(request) {
  const proto = String(request.headers["x-forwarded-proto"] || "https").split(",")[0].trim();
  const host = String(request.headers["x-forwarded-host"] || request.headers.host || "www.automation-outlet.co.uk").split(",")[0].trim();
  return `${proto}://${host}`;
}

function add(params, key, value) {
  if (value === undefined || value === null || value === "") return;
  params.append(key, String(value));
}

export default async function handler(request, response) {
  if (request.method !== "POST") {
    response.setHeader("Allow", "POST");
    return json(response, 405, { error: "Method not allowed" });
  }

  const secret = process.env.STRIPE_SECRET_KEY || "";
  if (!secret) return json(response, 503, { error: "Stripe sandbox is not configured for this environment." });
  if (!secret.startsWith("sk_test_")) {
    return json(response, 503, { error: "Sandbox checkout is locked because the configured Stripe key is not a test key." });
  }

  try {
    const body = parseBody(request);
    const requested = Array.isArray(body.items) ? body.items : [];
    if (!requested.length) return json(response, 400, { error: "Your basket is empty." });
    if (requested.length > 20) return json(response, 400, { error: "Too many basket lines." });

    const products = publicProducts(await listProducts());
    const bySlug = new Map(products.map((product) => [productSlug(product), product]));
    const lines = [];
    let subtotalPence = 0;

    for (const item of requested) {
      const id = String(item?.id || "").trim();
      const quantity = Math.max(1, Math.min(99, Number.parseInt(item?.quantity, 10) || 1));
      const product = bySlug.get(id);
      if (!product || !available(product)) {
        return json(response, 409, { error: `One of the items in your basket is no longer available: ${id || "unknown item"}.` });
      }
      if (product.deliveryMode !== "parcel") {
        return json(response, 409, { error: `${product.partNumber} requires a delivery quote and cannot use automatic card checkout.` });
      }
      const unit = money(product);
      if (!unit) return json(response, 409, { error: `A current price is not available for ${product.partNumber}.` });
      const stock = Math.max(0, Number.parseInt(product.quantity, 10) || 0);
      if (quantity > stock) {
        return json(response, 409, { error: `Only ${stock} unit${stock === 1 ? "" : "s"} of ${product.partNumber} are currently available.` });
      }
      const unitAmount = Math.round(Number(unit) * 100);
      subtotalPence += unitAmount * quantity;
      lines.push({ product, quantity, unitAmount });
    }

    const shippingPence = subtotalPence >= 25000 ? 0 : 795;
    const shippingName = shippingPence === 0 ? "Free UK delivery" : "UK standard delivery";

    const reservationId = newReservationId();
    const expiresAtMs = Date.now() + (31 * 60 * 1000);
    const expiresAt = new Date(expiresAtMs).toISOString();
    const reservationItems = lines.map(({ product, quantity }) => ({
      stockId: product.id,
      partNumber: product.partNumber,
      quantity,
    }));
    await appendInventoryEvent({
      kind: "reserve",
      reservationId,
      expiresAt,
      items: reservationItems,
    });
    const allocationEvents = await listInventoryEvents();
    const baseQuantities = new Map(products.map((product) => [product.id, product.baseQuantity ?? product.quantity]));
    if (!reservationIsAllocated(baseQuantities, allocationEvents, reservationId)) {
      await appendInventoryEvent({ kind: "release", reservationId, items: reservationItems }).catch(() => {});
      return json(response, 409, { error: "Stock changed while checkout was starting. Please refresh your basket and try again." });
    }

    const params = new URLSearchParams();
    add(params, "mode", "payment");
    add(params, "ui_mode", "hosted_page");
    add(params, "submit_type", "pay");
    add(params, "customer_creation", "always");
    add(params, "billing_address_collection", "auto");
    add(params, "phone_number_collection[enabled]", "true");
    add(params, "shipping_address_collection[allowed_countries][0]", "GB");
    add(params, "shipping_options[0][shipping_rate_data][type]", "fixed_amount");
    add(params, "shipping_options[0][shipping_rate_data][fixed_amount][amount]", shippingPence);
    add(params, "shipping_options[0][shipping_rate_data][fixed_amount][currency]", "gbp");
    add(params, "shipping_options[0][shipping_rate_data][display_name]", shippingName);
    add(params, "shipping_options[0][shipping_rate_data][delivery_estimate][minimum][unit]", "business_day");
    add(params, "shipping_options[0][shipping_rate_data][delivery_estimate][minimum][value]", 2);
    add(params, "shipping_options[0][shipping_rate_data][delivery_estimate][maximum][unit]", "business_day");
    add(params, "shipping_options[0][shipping_rate_data][delivery_estimate][maximum][value]", 4);
    add(params, "allow_promotion_codes", "false");
    add(params, "automatic_tax[enabled]", "false");
    add(params, "expires_at", Math.floor(expiresAtMs / 1000));

    const origin = siteOrigin(request);
    add(params, "success_url", `${origin}/order-success.html?session_id={CHECKOUT_SESSION_ID}&sandbox=1`);
    add(params, "cancel_url", `${origin}/cart.html?stripe_test=1&cancelled=1`);

    lines.forEach(({ product, quantity, unitAmount }, index) => {
      const prefix = `line_items[${index}]`;
      add(params, `${prefix}[quantity]`, quantity);
      add(params, `${prefix}[price_data][currency]`, "gbp");
      add(params, `${prefix}[price_data][unit_amount]`, unitAmount);
      add(params, `${prefix}[price_data][product_data][name]`, `${product.brand} ${product.partNumber}`);
      add(params, `${prefix}[price_data][product_data][description]`, String(product.title || product.category || "Industrial automation part").slice(0, 500));
      if (/^https:\/\//i.test(String(product.imageUrl || ""))) {
        add(params, `${prefix}[price_data][product_data][images][0]`, product.imageUrl);
      }
      add(params, `${prefix}[price_data][product_data][metadata][ao_stock_id]`, product.id || productSlug(product));
      add(params, `${prefix}[price_data][product_data][metadata][part_number]`, product.partNumber);
    });

    add(params, "metadata[ao_environment]", "sandbox");
    add(params, "metadata[ao_line_count]", lines.length);
    add(params, "metadata[ao_delivery_mode]", "uk_parcel");
    add(params, "metadata[ao_product_subtotal_pence]", subtotalPence);
    add(params, "metadata[ao_shipping_pence]", shippingPence);
    add(params, "metadata[ao_reservation_id]", reservationId);
    add(params, "metadata[ao_stock_action]", "reserved");
    add(params, "metadata[ao_order_status]", "payment_pending");

    const stripe = await fetch("https://api.stripe.com/v1/checkout/sessions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${secret}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: params.toString(),
    });

    const data = await stripe.json().catch(() => ({}));
    if (!stripe.ok || !data.url) {
      await appendInventoryEvent({ kind: "release", reservationId, items: reservationItems }).catch(() => {});
      console.error("Stripe Checkout session creation failed", stripe.status, data?.error?.type, data?.error?.code);
      return json(response, 502, { error: data?.error?.message || "Stripe could not create the checkout session." });
    }

    return json(response, 200, { url: data.url, sessionId: data.id, sandbox: true });
  } catch (error) {
    console.error("Sandbox checkout error", error?.message || error);
    return json(response, error?.status === 503 ? 503 : 500, { error: "Could not start Stripe Checkout." });
  }
}

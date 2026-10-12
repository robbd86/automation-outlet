import crypto from "node:crypto";

const INVENTORY_API = "https://integration-api.automa.net/ext/api/v1/inventory";
const MAX_OFFERS = 200;
// Reference rates, not executable bank/FX quotes. Cache on warm Vercel instances
// to avoid unnecessary traffic; instances may independently refresh.
const FX_API = "https://api.frankfurter.dev/v1/latest?base=EUR";
const FX_TTL_MS = 6 * 60 * 60 * 1000;
let fxCached = null;
let fxCachedAt = 0;

export function parseGbpRates(data) {
  const eurRates = data?.rates;
  const gbpPerEur = Number(eurRates?.GBP);
  if (!Number.isFinite(gbpPerEur) || gbpPerEur <= 0 || !/^\d{4}-\d{2}-\d{2}$/.test(String(data?.date || ""))) {
    throw new Error("Invalid exchange-rate data");
  }
  const rates = {GBP:1, EUR:gbpPerEur};
  for (const [code, amount] of Object.entries(eurRates)) {
    const n = Number(amount);
    if (/^[A-Z]{3}$/.test(code) && n > 0 && Number.isFinite(n)) {
      rates[code] = gbpPerEur / n;
    }
  }
  return {status:"available",base:"GBP",date:data.date,source:"Frankfurter (central-bank reference rates)",rates};
}

export async function getGbpRates() {
  if (fxCached && Date.now() - fxCachedAt < FX_TTL_MS) return fxCached;
  try {
    const response = await fetch(FX_API, {
      method:"GET",
      headers:{Accept:"application/json"},
      signal:AbortSignal.timeout(4500),
    });
    if (!response.ok) throw new Error("FX service returned an error");
    const data = await response.json();
    const parsed = parseGbpRates(data);
    fxCached = parsed;
    fxCachedAt = Date.now();
    return parsed;
  } catch (error) {
    console.warn("FX reference rates unavailable", error?.message || "network error");
    // Fail safely: no invented exchange rates or parity defaults.
    return {status:"unavailable",base:"GBP",date:null,source:"Frankfurter (central-bank reference rates)",rates:{GBP:1}};
  }
}


function equalConstantTime(a, b) {
  const x = Buffer.from(String(a ?? ""), "utf8");
  const y = Buffer.from(String(b ?? ""), "utf8");
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

function clean(value, max = 120) {
  return String(value ?? "").replace(/[\x00-\x1F\x7F]/g, " ").trim().slice(0, max);
}

// Preserve meaningful part-number punctuation. 1756171 is not 1756-L71.
export function normaliseMpn(value) {
  return clean(value, 100).toUpperCase().replace(/[‐‑‒–—]/g, "-").replace(/\s+/g, "");
}

export function classifyCondition(value) {
  const s = clean(value, 100).toLowerCase();
  if (/refurb|repair|overhaul|recondition|^rem$/.test(s)) return "Refurbished";
  if (/used|gebraucht|usato|second.hand|pre.owned|^sap$/.test(s)) return "Used";
  if (/new|unused|sealed|factory|original package|^nfs$|^sop$|^nowy$/.test(s)) return "New";
  return "Other";
}

function validDate(value) {
  const s = clean(value, 40);
  return !Number.isNaN(Date.parse(s)) && s ? s : null;
}

// Automa.Net's company.country is an object, not a display-ready string.
export function countryName(value) {
  if (typeof value === "string" || typeof value === "number") {
    return clean(value, 70) || "Not specified";
  }
  if (!value || typeof value !== "object") return "Not specified";
  const candidates = [value.name, value.countryName, value.label, value.englishName, value.displayName, value.iso2, value.isoCode, value.code, value.alpha2, value.countryCode];
  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim()) return clean(candidate, 70);
  }
  return "Not specified";
}

export function normaliseOffers(payload, phrase) {
  const items = Array.isArray(payload?.data?.items) ? payload.data.items : [];
  const needle = normaliseMpn(phrase);
  const exact = items.filter(item => normaliseMpn(item?.mpn) === needle);
  const available = exact.filter(item => Number(item?.quantity) > 0);
  const offers = available.slice(0, MAX_OFFERS).map(item => {
    const priceValue = Number(item?.pricing?.amount);
    const qty = Math.floor(Number(item.quantity));
    const country = countryName(item?.company?.country);
    const currency = clean(item?.pricing?.currency, 5).toUpperCase();
    return {
      id:clean(item.id, 80),
      supplier:clean(item?.company?.name, 130) || "Supplier not named",
      supplierCountry:country || "Not specified",
      mpn:clean(item.mpn, 90),
      brand:clean(item.brand, 90),
      quantity:Math.max(0, qty),
      condition:clean(item.condition, 95) || "Not specified",
      conditionGroup:classifyCondition(item.condition),
      status:clean(item.status, 45) || "Supplier-listed",
      delivery:clean(item.deliveryTime, 80) || "Confirm with supplier",
      updatedAt:validDate(item.updatedAt),
      unitPrice:Number.isFinite(priceValue) && priceValue > 0 ? priceValue : null,
      currency:/^[A-Z]{3}$/.test(currency) ? currency : null,
    };
  });
  const suppliers = new Set(offers.map(x => x.supplier.toLowerCase() + "|" + x.supplierCountry.toLowerCase()));
  return {
    summary:{
      returned:items.length,
      exactOffers:exact.length,
      availableOffers:available.length,
      displayedOffers:offers.length,
      suppliers:suppliers.size,
      offersWithPrice:offers.filter(x => x.unitPrice !== null && x.currency).length,
      updatedAt:new Date().toISOString(),
    },
    offers,
  };
}

function send(res, status, data) {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "private, no-store, max-age=0");
  res.setHeader("X-Robots-Tag", "noindex, nofollow");
  res.setHeader("X-Content-Type-Options", "nosniff");
  return res.status(status).json(data);
}

export async function supplierSearchHandler(req, res) {
  if (process.env.VERCEL_ENV !== "preview") return send(res, 404, {error:"Preview only."});
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return send(res, 405, {error:"GET only."});
  }
  const expected = process.env.AO_DEAL_DESK_KEY;
  const submitted = req.headers["x-deal-desk-key"];
  if (!expected) return send(res, 503, {error:"AO admin access is not configured."});
  if (!submitted || !equalConstantTime(submitted, expected)) return send(res, 401, {error:"Invalid AO Deal Desk access key."});
  if (String(req.query?.check ?? "") === "1") return send(res, 200, {ok:true,mode:"preview",service:"AO Supplier Search"});

  const part = clean(req.query?.q, 100);
  if (part.length < 3 || part.length > 64 || !/^[a-zA-Z0-9 _./+\-]+$/.test(part)) {
    return send(res, 400, {error:"Enter a valid manufacturer part number (3–64 characters)."});
  }
  const apiKey = process.env.AUTOMA_NET_API_KEY;
  if (!apiKey) return send(res, 503, {error:"Automa.Net Preview API key is not configured."});

  const url = new URL(INVENTORY_API);
  url.searchParams.set("phrase", part);

  try {
    const response = await fetch(url, {
      method:"GET",
      headers:{Authorization:apiKey,Accept:"application/json"},
      cache:"no-store",
      signal:AbortSignal.timeout(14000),
    });
    if (response.status === 401 || response.status === 403) return send(res, 502, {error:"Automa.Net has rejected this API account for inventory searching."});
    if (response.status === 402) return send(res, 502, {error:"Automa.Net reports that an additional account entitlement or payment is required."});
    if (response.status === 429) return send(res, 429, {error:"Automa.Net API rate limit reached. Please try later."});
    if (!response.ok) return send(res, 502, {error:"Supplier service temporarily unavailable (" + response.status + ")."});
    const payload = await response.json().catch(() => null);
    if (!payload || !Array.isArray(payload?.data?.items)) return send(res, 502, {error:"Unexpected supplier search response."});
    const result = normaliseOffers(payload, part);
    const fx = await getGbpRates();
    return send(res, 200, {
      query:part,
      source:"Automa.Net — supplier-reported inventory",
      fx,
      ...result,
      disclaimer:"Supplier-reported, not AO-owned stock. Verify availability, specification, delivery, cost and reseller terms before quoting.",
    });
  } catch (error) {
    console.error("Supplier search upstream failure",error?.name || "error");
    return send(res, 504, {error:"Supplier search timed out or could not connect. Try again."});
  }
}

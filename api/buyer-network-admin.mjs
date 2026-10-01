import crypto from "node:crypto";

const AIRTABLE_API = "https://api.airtable.com/v0";

function json(response, status, body) {
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("Cache-Control", "no-store");
  return response.status(status).json(body);
}

function clean(value, max = 500) {
  return String(value ?? "").replace(/\0/g, "").trim().slice(0, max);
}

function secureEqual(left, right) {
  const a = Buffer.from(String(left || ""));
  const b = Buffer.from(String(right || ""));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function requireAdmin(request) {
  const expected = process.env.AO_DEAL_DESK_KEY;
  const supplied = request.headers?.["x-deal-desk-key"];
  return Boolean(expected && supplied && secureEqual(supplied, expected));
}

async function fetchBuyers() {
  const token = process.env.AIRTABLE_ACCESS_TOKEN;
  const baseId = process.env.AIRTABLE_BASE_ID;
  const tableId = process.env.AIRTABLE_BUYERS_TABLE_ID;
  if (!token || !baseId || !tableId) {
    const error = new Error("Buyer network storage is not configured");
    error.status = 503;
    throw error;
  }

  const buyers = [];
  let offset = "";
  do {
    const params = new URLSearchParams({ pageSize: "100" });
    if (offset) params.set("offset", offset);
    const result = await fetch(
      `${AIRTABLE_API}/${encodeURIComponent(baseId)}/${encodeURIComponent(tableId)}?${params.toString()}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    const data = await result.json().catch(() => ({}));
    if (!result.ok) {
      const error = new Error(data?.error?.message || "Could not load buyer records");
      error.status = 502;
      throw error;
    }
    for (const record of data.records || []) {
      const f = record.fields || {};
      buyers.push({
        id: record.id,
        createdTime: record.createdTime || "",
        name: clean(f.Name, 120),
        company: clean(f.Company, 160),
        email: clean(f.Email, 200),
        phone: clean(f["Phone / WhatsApp"], 60),
        buyerType: clean(f["Buyer Type"], 100),
        buyingVolume: clean(f["Typical Requirement"], 100),
        categories: Array.isArray(f.Categories) ? f.Categories.map((v) => clean(v, 100)).filter(Boolean) : [],
        brands: clean(f["Preferred Brands"], 500),
        wantedParts: clean(f["Wanted Parts / Ranges"], 2000),
        condition: clean(f.Condition, 100),
        preferredContact: clean(f["Preferred Contact"], 60),
        countryRegion: clean(f["Country / Region"], 160),
        spendBand: clean(f["Typical Opportunity Size"], 100),
        status: clean(f.Status, 60),
        signupDate: clean(f["Signup Date"], 80),
      });
    }
    offset = clean(data.offset, 300);
  } while (offset);

  return buyers;
}

export default async function handler(request, response) {
  response.setHeader("Allow", "GET");
  if (request.method !== "GET") return json(response, 405, { ok: false, error: "Method not allowed" });
  if (!requireAdmin(request)) return json(response, 401, { ok: false, error: "Invalid admin key" });

  try {
    const buyers = await fetchBuyers();
    return json(response, 200, { ok: true, buyers });
  } catch (error) {
    console.error("Buyer network admin error", error.message);
    return json(response, error.status || 500, { ok: false, error: error.message || "Could not load buyers" });
  }
}

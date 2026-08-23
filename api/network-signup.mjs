const AIRTABLE_API = "https://api.airtable.com/v0";
const DEFAULT_FORMSPREE_ENDPOINT = "https://formspree.io/f/xqevvvll";

const SIGNUP_CONFIG = {
  "buyer-network": {
    tableEnv: "AIRTABLE_BUYERS_TABLE_ID",
    source: "Website Buyer Alerts",
    allowed: {
      buyer_type: ["End user / manufacturer", "Controls / systems integrator", "Maintenance / engineering company", "Industrial reseller / dealer", "Machine builder / OEM", "Other"],
      buying_volume: ["Individual replacement parts", "Small quantities", "Job lots / bulk stock", "Both individual parts and bulk lots"],
      categories: ["PLC / CPU", "HMI", "Drives", "Servo", "I/O", "Job lots"],
      condition: ["New or used", "New / unused only", "Used tested is fine", "Untested considered", "Faulty / repair stock considered"],
      preferred_contact: ["Email", "WhatsApp", "Phone", "Email or WhatsApp"],
    },
  },
  "supplier-network": {
    tableEnv: "AIRTABLE_SUPPLIERS_TABLE_ID",
    source: "Website Supplier Network",
    allowed: {
      supplier_type: ["Manufacturer / end user", "Electrical / controls contractor", "Machine builder / OEM", "Panel builder", "Maintenance / engineering company", "Liquidator / auctioneer", "Industrial reseller / dealer", "Other"],
      stock_types: ["PLC / CPU", "HMI", "Drives", "Servo", "Panels", "Clearances"],
      frequency: ["Occasionally / ad hoc", "A few times a year", "Monthly", "Regularly / ongoing", "Planning a one-off future clearance"],
      preferred_route: ["Open to the best option", "Outright cash purchase", "Selective purchase", "Managed resale / consignment"],
    },
  },
};

function json(response, status, body) {
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("Cache-Control", "no-store");
  return response.status(status).json(body);
}

function clean(value, max = 500) {
  return String(value ?? "").replace(/\0/g, "").trim().slice(0, max);
}

function cleanList(value, maxItems = 20, maxLength = 100) {
  const items = Array.isArray(value) ? value : value ? [value] : [];
  return [...new Set(items.map((item) => clean(item, maxLength)).filter(Boolean))].slice(0, maxItems);
}

function parseBody(body) {
  if (body && typeof body === "object") return body;
  if (typeof body === "string") return JSON.parse(body);
  return {};
}

function isEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) && value.length <= 200;
}

function allowedValue(value, choices) {
  return choices.includes(value) ? value : "";
}

function allowedList(values, choices) {
  return values.filter((value) => choices.includes(value));
}

export function normaliseSignup(raw) {
  const signupType = clean(raw?.signup_type, 40);
  const config = SIGNUP_CONFIG[signupType];
  if (!config) return { signupType, error: "Invalid signup type" };

  const signup = {
    signupType,
    website: clean(raw?.website, 200),
    name: clean(raw?.name, 120),
    company: clean(raw?.company, 160),
    email: clean(raw?.email, 200).toLowerCase(),
    phone: clean(raw?.phone, 50),
    consent: raw?.consent === true || clean(raw?.consent, 10).toLowerCase() === "yes",
  };

  if (signupType === "buyer-network") {
    Object.assign(signup, {
      buyerType: allowedValue(clean(raw?.buyer_type, 80), config.allowed.buyer_type),
      buyingVolume: allowedValue(clean(raw?.buying_volume, 100), config.allowed.buying_volume),
      categories: allowedList(cleanList(raw?.categories), config.allowed.categories),
      brands: clean(raw?.brands, 500),
      wantedParts: clean(raw?.wanted_parts, 2000),
      condition: allowedValue(clean(raw?.condition, 100), config.allowed.condition),
      preferredContact: allowedValue(clean(raw?.preferred_contact, 50), config.allowed.preferred_contact),
    });
  } else {
    Object.assign(signup, {
      supplierType: allowedValue(clean(raw?.supplier_type, 100), config.allowed.supplier_type),
      region: clean(raw?.region, 160),
      stockTypes: allowedList(cleanList(raw?.stock_types), config.allowed.stock_types),
      brands: clean(raw?.brands, 500),
      frequency: allowedValue(clean(raw?.frequency, 100), config.allowed.frequency),
      preferredRoute: allowedValue(clean(raw?.preferred_route, 100), config.allowed.preferred_route),
      notes: clean(raw?.notes, 2000),
    });
  }
  return signup;
}

export function validateSignup(signup) {
  if (signup.error) return signup.error;
  if (!signup.name) return "Name is required";
  if (!isEmail(signup.email)) return "A valid email is required";
  if (!signup.consent) return "Consent is required";
  if (signup.signupType === "buyer-network" && (!signup.buyerType || !signup.buyingVolume || !signup.condition || !signup.preferredContact)) {
    return "One or more buyer selections are invalid";
  }
  if (signup.signupType === "supplier-network" && (!signup.supplierType || !signup.frequency || !signup.preferredRoute)) {
    return "One or more supplier selections are invalid";
  }
  return "";
}

function airtableFields(signup) {
  const common = {
    Name: signup.name,
    Company: signup.company,
    Email: signup.email,
    "Phone / WhatsApp": signup.phone,
    Consent: true,
  };
  if (signup.signupType === "buyer-network") {
    return {
      ...common,
      "Buyer Type": signup.buyerType,
      "Typical Requirement": signup.buyingVolume,
      Categories: signup.categories,
      "Preferred Brands": signup.brands,
      "Wanted Parts / Ranges": signup.wantedParts,
      Condition: signup.condition,
      "Preferred Contact": signup.preferredContact,
      Source: "Website Buyer Alerts",
    };
  }
  return {
    ...common,
    "Supplier Type": signup.supplierType,
    Region: signup.region,
    "Stock Types": signup.stockTypes,
    Brands: signup.brands,
    "Availability Frequency": signup.frequency,
    "Preferred Route": signup.preferredRoute,
    Notes: signup.notes,
    Source: "Website Supplier Network",
  };
}

function airtableSettings(signupType) {
  const config = SIGNUP_CONFIG[signupType];
  return {
    token: process.env.AIRTABLE_ACCESS_TOKEN,
    baseId: process.env.AIRTABLE_BASE_ID,
    tableId: process.env[config.tableEnv],
  };
}

function airtableError(data, status) {
  const error = new Error(data?.error?.message || `Airtable request failed (${status})`);
  error.status = status >= 500 ? 502 : 500;
  return error;
}

async function upsertAirtable(signup) {
  const { token, baseId, tableId } = airtableSettings(signup.signupType);
  if (!token || !baseId || !tableId) {
    const error = new Error("Network signup storage is not configured");
    error.status = 503;
    throw error;
  }
  const result = await fetch(`${AIRTABLE_API}/${encodeURIComponent(baseId)}/${encodeURIComponent(tableId)}`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      performUpsert: { fieldsToMergeOn: ["Email"] },
      records: [{ fields: airtableFields(signup) }],
    }),
  });
  const data = await result.json().catch(() => ({}));
  if (!result.ok) throw airtableError(data, result.status);
  return data;
}

async function initialiseCreatedRecord(signup, stored) {
  const recordId = stored.createdRecords?.[0];
  if (!recordId) return;

  const { token, baseId, tableId } = airtableSettings(signup.signupType);
  const result = await fetch(`${AIRTABLE_API}/${encodeURIComponent(baseId)}/${encodeURIComponent(tableId)}`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      records: [{
        id: recordId,
        fields: {
          Status: "New",
          "Signup Date": new Date().toISOString(),
        },
      }],
    }),
  });
  const data = await result.json().catch(() => ({}));
  if (!result.ok) throw airtableError(data, result.status);
}

async function notifyFormspree(raw, signup) {
  const endpoint = process.env.FORMSPREE_NETWORK_ENDPOINT || DEFAULT_FORMSPREE_ENDPOINT;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 4000);
  try {
    const result = await fetch(endpoint, {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify({ ...raw, email: signup.email, signup_type: signup.signupType }),
      signal: controller.signal,
    });
    if (!result.ok) console.warn("Formspree notification failed", result.status);
  } catch (error) {
    console.warn("Formspree notification failed", error.message);
  } finally {
    clearTimeout(timeout);
  }
}

function originAllowed(request) {
  const origin = clean(request.headers?.origin, 500);
  if (!origin) return true;

  // Browser submissions are same-origin. Comparing Origin to Host safely supports
  // Vercel branch aliases as well as production without having to enumerate every
  // preview hostname in environment variables.
  try {
    const originUrl = new URL(origin);
    const requestHost = clean(request.headers?.host || request.headers?.["x-forwarded-host"], 500).toLowerCase();
    if (requestHost && originUrl.host.toLowerCase() === requestHost) return true;
  } catch {
    return false;
  }

  const configured = clean(process.env.AO_ALLOWED_ORIGIN, 2000)
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  const defaults = ["https://automation-outlet.co.uk", "https://www.automation-outlet.co.uk"];
  if (process.env.VERCEL_URL) defaults.push(`https://${process.env.VERCEL_URL}`);
  return [...configured, ...defaults].includes(origin);
}

export default async function handler(request, response) {
  response.setHeader("Allow", "POST, OPTIONS");
  if (request.method === "OPTIONS") return response.status(204).end();
  if (request.method !== "POST") return json(response, 405, { ok: false, error: "Method not allowed" });
  if (!originAllowed(request)) return json(response, 403, { ok: false, error: "Origin not allowed" });

  let raw;
  try {
    raw = parseBody(request.body);
  } catch {
    return json(response, 400, { ok: false, error: "Malformed JSON" });
  }

  const signup = normaliseSignup(raw);
  if (signup.website) return json(response, 200, { ok: true, message: "Signup received" });
  const problem = validateSignup(signup);
  if (problem) return json(response, 400, { ok: false, error: problem });

  try {
    const stored = await upsertAirtable(signup);
    await initialiseCreatedRecord(signup, stored);
    await notifyFormspree(raw, signup);
    return json(response, 200, {
      ok: true,
      action: stored.createdRecords?.length ? "created" : "updated",
      message: "Signup saved",
    });
  } catch (error) {
    console.error("Network signup error", error.message);
    return json(response, error.status || 500, {
      ok: false,
      error: error.status === 503 ? error.message : "We could not save your signup. Please try again.",
    });
  }
}

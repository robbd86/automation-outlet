import crypto from "node:crypto";

const API_VERSION = "2022-11-28";
const DEFAULT_REPO = "robbd86/automation-outlet-site";
const MARKER_RE = /<!-- AO_ENQUIRY_B64:([A-Za-z0-9+/=]+) -->/;

function json(response, status, body) {
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("Cache-Control", "no-store");
  response.status(status).json(body);
}

function clean(value, max = 500) {
  return String(value ?? "").replace(/\0/g, "").trim().slice(0, max);
}

function money(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0
    ? Math.round(parsed * 100) / 100
    : null;
}

function percent(value, fallback = null) {
  const parsed = Number(value);
  return Number.isFinite(parsed)
    ? Math.round(Math.max(0, Math.min(100, parsed)) * 100) / 100
    : fallback;
}

function reference() {
  const date = new Date().toISOString().slice(2, 10).replaceAll("-", "");
  const suffix = crypto.randomBytes(2).toString("hex").toUpperCase();
  return `AO-${date}-${suffix}`;
}

function secureEqual(left, right) {
  const a = Buffer.from(String(left || ""));
  const b = Buffer.from(String(right || ""));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function githubSettings() {
  const token = process.env.AO_GITHUB_TOKEN;
  const repo = process.env.AO_GITHUB_REPO || DEFAULT_REPO;
  return { token, repo };
}

async function github(path, options = {}) {
  const { token, repo } = githubSettings();
  if (!token) {
    const error = new Error("Seller portal storage is not configured");
    error.status = 503;
    throw error;
  }
  const response = await fetch(`https://api.github.com/repos/${repo}${path}`, {
    ...options,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": API_VERSION,
      "User-Agent": "automation-outlet-deal-desk",
      ...(options.headers || {}),
    },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.message || `GitHub request failed (${response.status})`);
    error.status = response.status;
    throw error;
  }
  return data;
}

function encodeData(data) {
  return Buffer.from(JSON.stringify(data), "utf8").toString("base64");
}

function decodeData(body) {
  const match = String(body || "").match(MARKER_RE);
  if (!match) return null;
  try {
    return JSON.parse(Buffer.from(match[1], "base64").toString("utf8"));
  } catch {
    return null;
  }
}

function routeLabel(value) {
  return {
    cash: "Immediate cash sale",
    "revenue-share": "Revenue share / consignment",
    "best-option": "Best route requested",
  }[value] || "Best route requested";
}

function statusLabel(value) {
  return {
    new: "New",
    reviewing: "Reviewing",
    "offer-ready": "Offer ready",
    "offer-sent": "Offer sent",
    negotiating: "Negotiating",
    won: "Stock secured",
    consignment: "Consignment agreed",
    declined: "Declined",
    closed: "Closed",
  }[value] || "New";
}

function offerModeLabel(value) {
  return {
    "three-options": "Three options",
    cash: "Cash purchase",
    selective: "Selective purchase",
    managed: "Managed resale",
    decline: "Polite decline",
  }[value] || "Not generated";
}

function normaliseItemValuations(raw, itemCount) {
  const rows = Array.isArray(raw) ? raw.slice(0, itemCount) : [];
  return Array.from({ length: itemCount }, (_, index) => {
    const value = rows[index] || {};
    return {
      selected: value.selected !== false,
      estimatedResaleGbp: money(value.estimatedResaleGbp),
      shippingGbp: money(value.shippingGbp),
      testingGbp: money(value.testingGbp),
      targetProfitGbp: money(value.targetProfitGbp),
    };
  });
}

function valuationCash(value, feesPercent) {
  const resale = Number(value?.estimatedResaleGbp) || 0;
  const fees = resale * (Number(feesPercent) || 0) / 100;
  return Math.max(
    0,
    resale
      - fees
      - (Number(value?.shippingGbp) || 0)
      - (Number(value?.testingGbp) || 0)
      - (Number(value?.targetProfitGbp) || 0)
  );
}

function quoteBlock(text) {
  return clean(text, 5000)
    .split("\n")
    .map((line) => `> ${line}`)
    .join("\n");
}

function renderIssue(data) {
  const admin = data.admin || {};
  const contact = data.contact || {};
  const feesPercent = Number(admin.feesPercent) || 15.42;
  const valuations = normaliseItemValuations(admin.itemValuations, data.items?.length || 0);
  const itemRows = (data.items || []).map((item, index) => {
    const valuation = valuations[index] || {};
    const maxCash = valuationCash(valuation, feesPercent);
    return `| ${index + 1} | ${valuation.selected === false ? "No" : "Yes"} | ${item.quantity || 1} | ${item.equipmentType || "—"} | ${item.manufacturer || "—"} | ${item.partNumber || "—"} | ${item.condition || "—"} | ${valuation.estimatedResaleGbp ? `£${Number(valuation.estimatedResaleGbp).toFixed(2)}` : "—"} | ${maxCash ? `£${maxCash.toFixed(2)}` : "—"} |`;
  }).join("\n");
  const offer = admin.offerDraft || {};
  const savedResponse = offer.generatedAt
    ? `\n## Saved seller response\n- **Mode:** ${offerModeLabel(offer.mode)}\n- **Generated:** ${offer.generatedAt}\n- **Subject:** ${offer.subject || "—"}\n\n### Email\n${quoteBlock(offer.emailText || "No email response saved.")}\n\n### WhatsApp\n${quoteBlock(offer.whatsappText || "No WhatsApp response saved.")}\n`
    : "";

  return `# Seller enquiry ${data.reference}

## Seller
- **Name:** ${contact.name || "—"}
- **Company:** ${contact.company || "—"}
- **Phone:** ${contact.phone || "—"}
- **Email:** ${contact.email || "—"}
- **Seller type:** ${data.sellerType || "—"}
- **Location:** ${data.postcode || "—"}

## Preferred transaction
- **Route:** ${routeLabel(data.preference)}
- **Urgency:** ${data.urgency || "—"}
- **Expected price:** ${data.expectedPriceGbp ? `£${Number(data.expectedPriceGbp).toFixed(2)}` : "Not stated"}
- **Logistics:** ${data.logistics || "—"}
- **Availability:** ${data.availability || "—"}

## Equipment and valuation
| # | Buy | Qty | Type | Manufacturer | Part number | Condition | Est. resale | Max cash |
|---|---|---:|---|---|---|---|---:|---:|
${itemRows || "| 1 | — | — | — | — | — | — | — | — |"}

## Seller notes
${data.notes || "No additional notes supplied."}

## Deal desk
- **Status:** ${statusLabel(admin.status)}
- **Priority:** ${admin.priority || "normal"}
- **Selling fees:** ${feesPercent}%
- **Estimated resale:** ${admin.estimatedResaleGbp ? `£${Number(admin.estimatedResaleGbp).toFixed(2)}` : "—"}
- **Recommended cash offer:** ${admin.recommendedOfferGbp ? `£${Number(admin.recommendedOfferGbp).toFixed(2)}` : "—"}
- **Managed resale estimate:** ${admin.managedLowGbp || admin.managedHighGbp ? `${admin.managedLowGbp ? `£${Number(admin.managedLowGbp).toFixed(2)}` : "—"} to ${admin.managedHighGbp ? `£${Number(admin.managedHighGbp).toFixed(2)}` : "—"}` : "—"}
- **Revenue share:** ${admin.revenueSharePercent ? `${Number(admin.revenueSharePercent)}% to seller of net proceeds` : "—"}
- **Next follow-up:** ${admin.nextFollowUp || "—"}
- **Internal notes:** ${admin.internalNotes || "—"}
${savedResponse}
Submitted ${data.submittedAt} through automation-outlet.co.uk.

<!-- AO_ENQUIRY_B64:${encodeData(data)} -->`;
}

function normaliseSubmission(raw) {
  const contact = raw?.contact || {};
  const items = Array.isArray(raw?.items) ? raw.items.slice(0, 50) : [];
  const data = {
    schema: 2,
    reference: reference(),
    submittedAt: new Date().toISOString(),
    preference: clean(raw?.preference, 40) || "best-option",
    sellerType: clean(raw?.sellerType, 80),
    urgency: clean(raw?.urgency, 80),
    expectedPriceGbp: money(raw?.expectedPriceGbp),
    postcode: clean(raw?.postcode, 100),
    logistics: clean(raw?.logistics, 120),
    availability: clean(raw?.availability, 120),
    contact: {
      name: clean(contact.name, 120),
      company: clean(contact.company, 160),
      phone: clean(contact.phone, 50),
      email: clean(contact.email, 200).toLowerCase(),
    },
    items: items.map((item) => ({
      quantity: Math.max(1, Math.min(9999, Number(item?.quantity) || 1)),
      equipmentType: clean(item?.equipmentType, 100),
      manufacturer: clean(item?.manufacturer, 80),
      partNumber: clean(item?.partNumber, 120),
      condition: clean(item?.condition, 100),
    })).filter((item) =>
      item.equipmentType || item.manufacturer || item.partNumber || item.condition
    ),
    notes: clean(raw?.notes, 4000),
    admin: {
      status: "new",
      priority: raw?.urgency === "urgent" ? "high" : "normal",
      feesPercent: 15.42,
      itemValuations: [],
      estimatedResaleGbp: null,
      recommendedOfferGbp: null,
      managedLowGbp: null,
      managedHighGbp: null,
      revenueSharePercent: 70,
      nextFollowUp: "",
      internalNotes: "",
      offerDraft: null,
      updatedAt: null,
    },
  };
  return data;
}

function validateSubmission(data) {
  if (!data.contact.name) return "Name is required";
  if (!data.contact.email || !data.contact.email.includes("@")) return "A valid email is required";
  if (!data.contact.phone) return "Phone number is required";
  if (!data.items.length) return "At least one equipment item is required";
  return "";
}

function checkOrigin(request) {
  const allowed = process.env.AO_ALLOWED_ORIGIN;
  if (!allowed) return true;
  const origin = String(request.headers.origin || "");
  return origin === allowed;
}

function requireAdmin(request) {
  const expected = process.env.AO_DEAL_DESK_KEY;
  const supplied = request.headers["x-deal-desk-key"];
  return Boolean(expected && secureEqual(supplied, expected));
}

async function ensureLabel(name, colour, description) {
  try {
    await github(`/labels`, {
      method: "POST",
      body: JSON.stringify({ name, color: colour, description }),
    });
  } catch (error) {
    if (error.status !== 422) console.warn("Could not ensure label", name, error.message);
  }
}

async function createEnquiry(request, response) {
  if (!checkOrigin(request)) return json(response, 403, { error: "Origin not allowed" });
  let raw;
  try {
    raw = request.body || {};
  } catch {
    return json(response, 400, { error: "Malformed JSON" });
  }
  if (clean(raw.website, 200)) return json(response, 202, { reference: reference() });

  const data = normaliseSubmission(raw);
  const problem = validateSubmission(data);
  if (problem) return json(response, 400, { error: problem });

  await ensureLabel("seller-enquiry", "2B7FFF", "Automation Outlet seller portal submission");
  await ensureLabel("status:new", "4D94FF", "New acquisition enquiry");

  const first = data.items[0] || {};
  const summary = [first.manufacturer, first.partNumber || first.equipmentType]
    .filter(Boolean)
    .join(" ");
  const issue = await github("/issues", {
    method: "POST",
    body: JSON.stringify({
      title: `${data.reference} | ${data.contact.name}${summary ? ` | ${summary}` : ""}`,
      body: renderIssue(data),
      labels: ["seller-enquiry", "status:new"],
    }),
  });

  return json(response, 201, {
    reference: data.reference,
    issueNumber: issue.number,
    message: "Enquiry created",
  });
}

async function listEnquiries(request, response) {
  if (!requireAdmin(request)) return json(response, 401, { error: "Invalid deal desk key" });
  const issues = await github("/issues?state=all&per_page=100&sort=created&direction=desc");
  const enquiries = issues
    .filter((issue) => !issue.pull_request)
    .map((issue) => ({ issue, data: decodeData(issue.body) }))
    .filter((entry) => entry.data)
    .map(({ issue, data }) => ({
      issueNumber: issue.number,
      issueState: issue.state,
      issueUrl: issue.html_url,
      createdAt: issue.created_at,
      updatedAt: issue.updated_at,
      ...data,
    }));
  return json(response, 200, { enquiries });
}

function updateMoney(update, key, current) {
  return Object.prototype.hasOwnProperty.call(update || {}, key)
    ? money(update[key])
    : current ?? null;
}

function normaliseOfferDraft(raw, current) {
  if (!raw || typeof raw !== "object") return current || null;
  const allowedModes = new Set(["three-options", "cash", "selective", "managed", "decline"]);
  const mode = clean(raw.mode, 30);
  const subject = clean(raw.subject, 200);
  const emailText = clean(raw.emailText, 5000);
  const whatsappText = clean(raw.whatsappText, 2500);
  const generatedAt = clean(raw.generatedAt, 40);
  if (!mode && !subject && !emailText && !whatsappText && !generatedAt) return null;
  return {
    mode: allowedModes.has(mode) ? mode : "three-options",
    subject,
    emailText,
    whatsappText,
    generatedAt,
  };
}

function mergeAdmin(current, update, itemCount) {
  const allowedStatuses = new Set([
    "new", "reviewing", "offer-ready", "offer-sent", "negotiating",
    "won", "consignment", "declined", "closed",
  ]);
  const status = clean(update?.status, 40);
  const feesPercent = Object.prototype.hasOwnProperty.call(update || {}, "feesPercent")
    ? percent(update.feesPercent, 15.42)
    : percent(current?.feesPercent, 15.42);
  return {
    ...(current || {}),
    status: allowedStatuses.has(status) ? status : current?.status || "new",
    priority: ["low", "normal", "high", "urgent"].includes(clean(update?.priority, 20))
      ? clean(update.priority, 20)
      : current?.priority || "normal",
    feesPercent,
    itemValuations: Object.prototype.hasOwnProperty.call(update || {}, "itemValuations")
      ? normaliseItemValuations(update.itemValuations, itemCount)
      : normaliseItemValuations(current?.itemValuations, itemCount),
    estimatedResaleGbp: updateMoney(update, "estimatedResaleGbp", current?.estimatedResaleGbp),
    recommendedOfferGbp: updateMoney(update, "recommendedOfferGbp", current?.recommendedOfferGbp),
    managedLowGbp: updateMoney(update, "managedLowGbp", current?.managedLowGbp),
    managedHighGbp: updateMoney(update, "managedHighGbp", current?.managedHighGbp),
    revenueSharePercent: Object.prototype.hasOwnProperty.call(update || {}, "revenueSharePercent")
      ? percent(update.revenueSharePercent, null)
      : percent(current?.revenueSharePercent, null),
    nextFollowUp: Object.prototype.hasOwnProperty.call(update || {}, "nextFollowUp")
      ? clean(update.nextFollowUp, 30)
      : current?.nextFollowUp || "",
    internalNotes: Object.prototype.hasOwnProperty.call(update || {}, "internalNotes")
      ? clean(update.internalNotes, 5000)
      : current?.internalNotes || "",
    offerDraft: Object.prototype.hasOwnProperty.call(update || {}, "offerDraft")
      ? normaliseOfferDraft(update.offerDraft, current?.offerDraft)
      : current?.offerDraft || null,
    updatedAt: new Date().toISOString(),
  };
}

async function updateEnquiry(request, response) {
  if (!requireAdmin(request)) return json(response, 401, { error: "Invalid deal desk key" });
  let raw;
  try {
    raw = request.body || {};
  } catch {
    return json(response, 400, { error: "Malformed JSON" });
  }
  const number = Number(raw.issueNumber);
  if (!Number.isInteger(number) || number <= 0) {
    return json(response, 400, { error: "Valid issueNumber is required" });
  }

  const issue = await github(`/issues/${number}`);
  const data = decodeData(issue.body);
  if (!data) return json(response, 404, { error: "Seller enquiry data not found" });

  const previousStatus = data.admin?.status || "new";
  data.schema = Math.max(2, Number(data.schema) || 1);
  data.admin = mergeAdmin(data.admin, raw.admin || {}, data.items?.length || 0);
  const terminal = new Set(["won", "consignment", "declined", "closed"]);
  const state = terminal.has(data.admin.status) ? "closed" : "open";

  await github(`/issues/${number}`, {
    method: "PATCH",
    body: JSON.stringify({
      title: `${data.reference} | ${statusLabel(data.admin.status)} | ${data.contact.name}`,
      body: renderIssue(data),
      state,
    }),
  });

  const offer = data.admin.offerDraft || {};
  await github(`/issues/${number}/comments`, {
    method: "POST",
    body: JSON.stringify({
      body: `Deal desk update: **${statusLabel(previousStatus)} → ${statusLabel(data.admin.status)}**\n\nPriority: ${data.admin.priority}\nRecommended offer: ${data.admin.recommendedOfferGbp ? `£${Number(data.admin.recommendedOfferGbp).toFixed(2)}` : "not set"}\nManaged estimate: ${data.admin.managedLowGbp || data.admin.managedHighGbp ? `${data.admin.managedLowGbp ? `£${Number(data.admin.managedLowGbp).toFixed(2)}` : "—"} to ${data.admin.managedHighGbp ? `£${Number(data.admin.managedHighGbp).toFixed(2)}` : "—"}` : "not set"}\nOffer response: ${offer.generatedAt ? `${offerModeLabel(offer.mode)} generated ${offer.generatedAt}` : "not generated"}\nNext follow-up: ${data.admin.nextFollowUp || "not set"}`,
    }),
  }).catch((error) => console.warn("Could not add audit comment", error.message));

  return json(response, 200, { enquiry: { issueNumber: number, ...data } });
}

export default async function handler(request, response) {
  response.setHeader("Allow", "GET, POST, PATCH, OPTIONS");
  if (request.method === "OPTIONS") return response.status(204).end();

  try {
    if (request.method === "POST") return await createEnquiry(request, response);
    if (request.method === "GET") return await listEnquiries(request, response);
    if (request.method === "PATCH") return await updateEnquiry(request, response);
    return json(response, 405, { error: "Method not allowed" });
  } catch (error) {
    console.error("Deal desk API error", error);
    return json(response, error.status || 500, {
      error: error.status === 503
        ? "Seller portal storage is not configured"
        : "The deal desk could not complete this request",
    });
  }
}

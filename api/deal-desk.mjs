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
  return Number.isFinite(parsed) && parsed >= 0 ? Math.round(parsed * 100) / 100 : null;
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

function renderIssue(data) {
  const admin = data.admin || {};
  const contact = data.contact || {};
  const itemRows = (data.items || []).map((item, index) =>
    `| ${index + 1} | ${item.quantity || 1} | ${item.equipmentType || "—"} | ${item.manufacturer || "—"} | ${item.partNumber || "—"} | ${item.condition || "—"} |`
  ).join("\n");

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

## Equipment
| # | Qty | Type | Manufacturer | Part number | Condition |
|---|---:|---|---|---|---|
${itemRows || "| 1 | — | — | — | — | — |"}

## Seller notes
${data.notes || "No additional notes supplied."}

## Deal desk
- **Status:** ${statusLabel(admin.status)}
- **Priority:** ${admin.priority || "normal"}
- **Estimated resale:** ${admin.estimatedResaleGbp ? `£${Number(admin.estimatedResaleGbp).toFixed(2)}` : "—"}
- **Recommended cash offer:** ${admin.recommendedOfferGbp ? `£${Number(admin.recommendedOfferGbp).toFixed(2)}` : "—"}
- **Revenue share:** ${admin.revenueSharePercent ? `${Number(admin.revenueSharePercent)}% to seller` : "—"}
- **Next follow-up:** ${admin.nextFollowUp || "—"}
- **Internal notes:** ${admin.internalNotes || "—"}

Submitted ${data.submittedAt} through automation-outlet.co.uk.

<!-- AO_ENQUIRY_B64:${encodeData(data)} -->`;
}

function normaliseSubmission(raw) {
  const contact = raw?.contact || {};
  const items = Array.isArray(raw?.items) ? raw.items.slice(0, 50) : [];
  const data = {
    schema: 1,
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
      estimatedResaleGbp: null,
      recommendedOfferGbp: null,
      revenueSharePercent: null,
      nextFollowUp: "",
      internalNotes: "",
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
  const summary = [first.manufacturer, first.partNumber || first.equipmentType].filter(Boolean).join(" ");
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

function mergeAdmin(current, update) {
  const allowedStatuses = new Set([
    "new", "reviewing", "offer-ready", "offer-sent", "negotiating",
    "won", "consignment", "declined", "closed",
  ]);
  const status = clean(update?.status, 40);
  return {
    ...(current || {}),
    status: allowedStatuses.has(status) ? status : current?.status || "new",
    priority: ["low", "normal", "high", "urgent"].includes(clean(update?.priority, 20))
      ? clean(update.priority, 20)
      : current?.priority || "normal",
    estimatedResaleGbp: money(update?.estimatedResaleGbp),
    recommendedOfferGbp: money(update?.recommendedOfferGbp),
    revenueSharePercent: Math.max(0, Math.min(100, Number(update?.revenueSharePercent) || 0)) || null,
    nextFollowUp: clean(update?.nextFollowUp, 30),
    internalNotes: clean(update?.internalNotes, 5000),
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
  data.admin = mergeAdmin(data.admin, raw.admin || {});
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

  await github(`/issues/${number}/comments`, {
    method: "POST",
    body: JSON.stringify({
      body: `Deal desk update: **${statusLabel(previousStatus)} → ${statusLabel(data.admin.status)}**\n\nPriority: ${data.admin.priority}\nRecommended offer: ${data.admin.recommendedOfferGbp ? `£${Number(data.admin.recommendedOfferGbp).toFixed(2)}` : "not set"}\nNext follow-up: ${data.admin.nextFollowUp || "not set"}`,
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

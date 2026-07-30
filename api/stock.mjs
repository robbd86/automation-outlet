import crypto from "node:crypto";

const API_VERSION = "2022-11-28";
const DEFAULT_REPO = "robbd86/automation-outlet-site";
const STOCK_LABEL = "stock-item";
const MARKER_RE = /<!-- AO_STOCK_B64:([A-Za-z0-9+/=]+) -->/;

function sendJson(response, status, body, cache = "no-store") {
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("Cache-Control", cache);
  response.status(status).json(body);
}

function clean(value, max = 500) {
  return String(value ?? "").replace(/\0/g, "").trim().slice(0, max);
}

function money(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.round(parsed * 100) / 100 : null;
}

function positiveInt(value, fallback = 1, max = 9999) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? Math.max(0, Math.min(max, parsed)) : fallback;
}

function secureEqual(left, right) {
  const a = Buffer.from(String(left || ""));
  const b = Buffer.from(String(right || ""));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function slugify(value) {
  return clean(value, 160)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function productId(raw, existing) {
  if (existing?.id) return existing.id;
  const base = slugify(raw?.partNumber || raw?.title || "stock-item") || "stock-item";
  return `${base}-${crypto.randomBytes(2).toString("hex")}`;
}

function githubSettings() {
  return {
    token: process.env.AO_GITHUB_TOKEN,
    repo: process.env.AO_GITHUB_REPO || DEFAULT_REPO,
  };
}

async function github(path, options = {}) {
  const { token, repo } = githubSettings();
  if (!token) {
    const error = new Error("Stock manager storage is not configured");
    error.status = 503;
    throw error;
  }

  const response = await fetch(`https://api.github.com/repos/${repo}${path}`, {
    ...options,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": API_VERSION,
      "User-Agent": "automation-outlet-stock-manager",
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

function normaliseProduct(raw, existing = null) {
  const now = new Date().toISOString();
  const allowedStatuses = new Set(["active", "draft", "sold"]);
  const requestedStatus = clean(raw?.status, 20);
  const status = allowedStatuses.has(requestedStatus)
    ? requestedStatus
    : existing?.status || "draft";

  return {
    schema: 1,
    id: productId(raw, existing),
    createdAt: existing?.createdAt || now,
    updatedAt: now,
    title: clean(raw?.title ?? existing?.title, 180),
    partNumber: clean(raw?.partNumber ?? existing?.partNumber, 120).toUpperCase(),
    brand: clean(raw?.brand ?? existing?.brand, 80),
    category: clean(raw?.category ?? existing?.category, 80),
    condition: clean(raw?.condition ?? existing?.condition, 100),
    priceGbp: money(raw?.priceGbp ?? existing?.priceGbp),
    quantity: positiveInt(raw?.quantity ?? existing?.quantity, 1),
    imageUrl: clean(raw?.imageUrl ?? existing?.imageUrl, 1200),
    ebayUrl: clean(raw?.ebayUrl ?? existing?.ebayUrl, 1200),
    description: clean(raw?.description ?? existing?.description, 2500),
    featured: Boolean(raw?.featured),
    status,
    sortOrder: positiveInt(raw?.sortOrder ?? existing?.sortOrder, 100, 100000),
  };
}

function validateProduct(product) {
  if (!product.title) return "Product title is required";
  if (!product.partNumber) return "Part number is required";
  if (!product.brand) return "Brand is required";
  if (!product.category) return "Category is required";
  if (!product.condition) return "Condition is required";
  if (product.priceGbp === null) return "A valid price is required";
  if (product.quantity < 0) return "Quantity cannot be negative";
  if (product.imageUrl && !/^https?:\/\//i.test(product.imageUrl)) {
    return "Image URL must start with http:// or https://";
  }
  if (product.ebayUrl && !/^https?:\/\//i.test(product.ebayUrl)) {
    return "eBay URL must start with http:// or https://";
  }
  return "";
}

function statusLabel(status) {
  return {
    active: "Active",
    draft: "Draft",
    sold: "Sold",
  }[status] || "Draft";
}

function renderIssue(product) {
  const price = product.priceGbp === null ? "—" : `£${Number(product.priceGbp).toFixed(2)}`;
  return `# ${product.title}

- **Part number:** ${product.partNumber}
- **Brand:** ${product.brand}
- **Category:** ${product.category}
- **Condition:** ${product.condition}
- **Price:** ${price}
- **Quantity:** ${product.quantity}
- **Status:** ${statusLabel(product.status)}
- **Featured:** ${product.featured ? "Yes" : "No"}
- **eBay:** ${product.ebayUrl || "Not linked"}
- **Image:** ${product.imageUrl || "Not supplied"}

## Description
${product.description || "No description supplied."}

Managed through Automation Outlet Stock Manager.

<!-- AO_STOCK_B64:${encodeData(product)} -->`;
}

function requireAdmin(request) {
  const expected = process.env.AO_DEAL_DESK_KEY;
  const supplied = request.headers["x-deal-desk-key"];
  return Boolean(expected && secureEqual(supplied, expected));
}

async function ensureStockLabel() {
  try {
    await github("/labels", {
      method: "POST",
      body: JSON.stringify({
        name: STOCK_LABEL,
        color: "2B7FFF",
        description: "Automation Outlet website stock item",
      }),
    });
  } catch (error) {
    if (error.status !== 422) throw error;
  }
}

function publicProduct(entry) {
  const { issueNumber, issueState, ...product } = entry;
  return product;
}

async function listProducts(request, response) {
  const admin = String(request.query?.admin || "") === "1";
  if (admin && !requireAdmin(request)) {
    return sendJson(response, 401, { error: "Invalid stock manager key" });
  }

  const issues = await github(`/issues?state=all&labels=${encodeURIComponent(STOCK_LABEL)}&per_page=100&sort=updated&direction=desc`);
  const products = issues
    .filter((issue) => !issue.pull_request)
    .map((issue) => {
      const data = decodeData(issue.body);
      return data ? { issueNumber: issue.number, issueState: issue.state, ...data } : null;
    })
    .filter(Boolean);

  if (admin) {
    return sendJson(response, 200, { products });
  }

  const activeProducts = products
    .filter((product) =>
      product.status === "active" &&
      product.quantity > 0 &&
      product.issueState === "open"
    )
    .sort((a, b) =>
      Number(b.featured) - Number(a.featured) ||
      Number(a.sortOrder || 100) - Number(b.sortOrder || 100) ||
      String(b.updatedAt || "").localeCompare(String(a.updatedAt || ""))
    )
    .map(publicProduct);

  return sendJson(
    response,
    200,
    { products: activeProducts },
    "public, s-maxage=60, stale-while-revalidate=300"
  );
}

async function createProduct(request, response) {
  if (!requireAdmin(request)) {
    return sendJson(response, 401, { error: "Invalid stock manager key" });
  }

  const product = normaliseProduct(request.body || {});
  const problem = validateProduct(product);
  if (problem) return sendJson(response, 400, { error: problem });

  await ensureStockLabel();
  const issue = await github("/issues", {
    method: "POST",
    body: JSON.stringify({
      title: `${product.partNumber} | ${product.title} | ${statusLabel(product.status)}`,
      body: renderIssue(product),
      labels: [STOCK_LABEL],
    }),
  });

  return sendJson(response, 201, {
    product: { issueNumber: issue.number, issueState: issue.state, ...product },
  });
}

async function updateProduct(request, response) {
  if (!requireAdmin(request)) {
    return sendJson(response, 401, { error: "Invalid stock manager key" });
  }

  const raw = request.body || {};
  const issueNumber = Number(raw.issueNumber);
  if (!Number.isInteger(issueNumber) || issueNumber <= 0) {
    return sendJson(response, 400, { error: "Valid issueNumber is required" });
  }

  const issue = await github(`/issues/${issueNumber}`);
  const existing = decodeData(issue.body);
  if (!existing) return sendJson(response, 404, { error: "Stock item data not found" });

  const product = normaliseProduct(raw.product || raw, existing);
  const problem = validateProduct(product);
  if (problem) return sendJson(response, 400, { error: problem });

  const state = product.status === "sold" || product.quantity === 0 ? "closed" : "open";
  await github(`/issues/${issueNumber}`, {
    method: "PATCH",
    body: JSON.stringify({
      title: `${product.partNumber} | ${product.title} | ${statusLabel(product.status)}`,
      body: renderIssue(product),
      state,
    }),
  });

  return sendJson(response, 200, {
    product: { issueNumber, issueState: state, ...product },
  });
}

export default async function handler(request, response) {
  try {
    if (request.method === "GET") return await listProducts(request, response);
    if (request.method === "POST") return await createProduct(request, response);
    if (request.method === "PATCH") return await updateProduct(request, response);
    response.setHeader("Allow", "GET, POST, PATCH");
    return sendJson(response, 405, { error: "Method not allowed" });
  } catch (error) {
    console.error("Stock API error", error);
    return sendJson(response, error.status || 500, {
      error: error.status === 500 ? "Unexpected stock manager error" : error.message,
    });
  }
}

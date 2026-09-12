import { publicProducts } from "../lib/shop.mjs";
const API_VERSION = "2022-11-28";
const DEFAULT_REPO = "robbd86/automation-outlet-site";
const STOCK_LABEL = "stock-item";
const MARKER_RE = /<!-- AO_STOCK_B64:([A-Za-z0-9+/=]+) -->/;
const SITE = "https://www.automation-outlet.co.uk";

function githubSettings() {
  return {
    token: process.env.AO_GITHUB_TOKEN,
    repo: process.env.AO_GITHUB_REPO || DEFAULT_REPO,
  };
}

async function github(path) {
  const { token, repo } = githubSettings();
  if (!token) {
    const error = new Error("Stock catalogue is not configured");
    error.status = 503;
    throw error;
  }

  const response = await fetch(`https://api.github.com/repos/${repo}${path}`, {
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": API_VERSION,
      "User-Agent": "automation-outlet-google-feed",
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

function decodeData(body) {
  const match = String(body || "").match(MARKER_RE);
  if (!match) return null;
  try {
    return JSON.parse(Buffer.from(match[1], "base64").toString("utf8"));
  } catch {
    return null;
  }
}

function slugify(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
}

function productSlug(product) {
  return slugify([product.brand, product.partNumber].filter(Boolean).join("-"));
}

function cleanCell(value) {
  return String(value ?? "")
    .replace(/[\t\r\n]+/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function publicDescription(value) {
  return String(value || "")
    .replace(/Full listing details and photographs are available via the linked eBay listing\.?/gi, "")
    .replace(/Full details (?:are )?available (?:on|via) eBay\.?/gi, "")
    .replace(/See (?:the )?eBay listing for (?:full )?details(?: and photographs)?\.?/gi, "")
    .replace(/in the imported eBay report/gi, "")
    .replace(/Condition as stated in the listing\./gi, "Condition stated above.")
    .replace(/\s{2,}/g, " ")
    .replace(/\s+([.,;:])/g, "$1")
    .trim();
}

function googleCondition(value) {
  const condition = String(value || "").toLowerCase();
  if (condition.includes("refurb")) return "refurbished";
  if (condition.includes("new")) return "new";
  return "used";
}

async function listProducts() {
  const products = [];
  for (let page = 1; page <= 10; page += 1) {
    const issues = await github(
      `/issues?state=all&labels=${encodeURIComponent(STOCK_LABEL)}&per_page=100&page=${page}&sort=updated&direction=desc`
    );
    for (const issue of issues) {
      if (issue.pull_request) continue;
      const product = decodeData(issue.body);
      if (product) products.push({ ...product, issueState: issue.state });
    }
    if (issues.length < 100) break;
  }
  return products;
}

export default async function handler(request, response) {
  try {
    if (request.method !== "GET" && request.method !== "HEAD") {
      response.setHeader("Allow", "GET, HEAD");
      return response.status(405).send("Method not allowed");
    }

    const products = publicProducts(await listProducts()).filter((product) =>
      product &&
      product.status === "active" &&
      Number(product.quantity) > 0 &&
      product.issueState === "open" &&
      Number(product.priceGbp) > 0 &&
      product.title &&
      product.partNumber &&
      product.brand &&
      /^https?:\/\//i.test(String(product.imageUrl || ""))
    );

    const headers = [
      "id",
      "title",
      "description",
      "link",
      "image_link",
      "availability",
      "price",
      "condition",
      "brand",
      "mpn",
      "product_type",
    ];

    const rows = products.map((product) => [
      product.id || product.partNumber,
      `${product.brand} ${product.partNumber} ${product.title}`,
      publicDescription(product.description) || `${product.brand} ${product.partNumber}. ${product.condition || "Industrial automation component"}.`,
      `${SITE}/stock/${productSlug(product)}`,
      product.imageUrl,
      "in_stock",
      `${Number(product.priceGbp).toFixed(2)} GBP`,
      googleCondition(product.condition),
      product.brand,
      product.partNumber,
      product.category || "Industrial Automation",
    ].map(cleanCell).join("\t"));

    const body = [headers.join("\t"), ...rows].join("\n") + "\n";

    response.setHeader("Content-Type", "text/tab-separated-values; charset=utf-8");
    response.setHeader("Content-Disposition", 'inline; filename="google-products.txt"');
    response.setHeader("Cache-Control", "public, s-maxage=60, stale-while-revalidate=300");
    response.setHeader("X-Content-Type-Options", "nosniff");
    return response.status(200).send(body);
  } catch (error) {
    console.error("Google Merchant feed error", error);
    response.setHeader("Content-Type", "text/plain; charset=utf-8");
    return response.status(error.status || 500).send("Unable to generate product feed right now.\n");
  }
}

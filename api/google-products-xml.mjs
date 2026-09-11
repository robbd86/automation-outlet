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

function googleCondition(value) {
  const condition = String(value || "").toLowerCase();
  if (condition.includes("refurb")) return "refurbished";
  if (condition.includes("new")) return "new";
  return "used";
}

function xml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
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

    const items = products.map((product) => {
      const title = `${product.brand} ${product.partNumber} ${product.title}`;
      const description =
        product.description ||
        `${product.brand} ${product.partNumber}. ${product.condition || "Industrial automation component"}.`;

      return [
        "    <item>",
        `      <g:id>${xml(product.id || product.partNumber)}</g:id>`,
        `      <g:title>${xml(title)}</g:title>`,
        `      <g:description>${xml(description)}</g:description>`,
        `      <g:link>${xml(`${SITE}/stock/${productSlug(product)}`)}</g:link>`,
        `      <g:image_link>${xml(product.imageUrl)}</g:image_link>`,
        "      <g:availability>in_stock</g:availability>",
        `      <g:price>${xml(`${Number(product.priceGbp).toFixed(2)} GBP`)}</g:price>`,
        `      <g:condition>${xml(googleCondition(product.condition))}</g:condition>`,
        `      <g:brand>${xml(product.brand)}</g:brand>`,
        `      <g:mpn>${xml(product.partNumber)}</g:mpn>`,
        `      <g:product_type>${xml(product.category || "Industrial Automation")}</g:product_type>`,
        "      <g:identifier_exists>yes</g:identifier_exists>",
        "    </item>",
      ].join("\n");
    }).join("\n");

    const body = [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">',
      "  <channel>",
      "    <title>Automation Outlet product feed</title>",
      `    <link>${SITE}</link>`,
      "    <description>Current Automation Outlet industrial automation stock</description>",
      items,
      "  </channel>",
      "</rss>",
      "",
    ].join("\n");

    response.setHeader("Content-Type", "application/xml; charset=utf-8");
    response.setHeader("Content-Disposition", 'inline; filename="google-products.xml"');
    response.setHeader("Cache-Control", "public, s-maxage=60, stale-while-revalidate=300");
    response.setHeader("X-Content-Type-Options", "nosniff");
    return response.status(200).send(body);
  } catch (error) {
    console.error("Google Merchant XML feed error", error);
    response.setHeader("Content-Type", "text/plain; charset=utf-8");
    return response.status(error.status || 500).send("Unable to generate product feed right now.\n");
  }
}

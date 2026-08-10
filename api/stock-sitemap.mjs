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
      "User-Agent": "automation-outlet-stock-sitemap",
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
      if (product && product.status !== "draft") products.push(product);
    }
    if (issues.length < 100) break;
  }
  return products;
}

function renderSitemap(products) {
  const bySlug = new Map();
  for (const product of products) {
    const slug = productSlug(product);
    if (!slug) continue;
    const existing = bySlug.get(slug);
    if (!existing || String(product.updatedAt || "") > String(existing.updatedAt || "")) {
      bySlug.set(slug, product);
    }
  }

  const urls = [...bySlug.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([slug, product]) => {
      const updated = String(product.updatedAt || product.createdAt || "").slice(0, 10);
      return `  <url>\n    <loc>${xml(`${SITE}/stock/${slug}`)}</loc>${updated ? `\n    <lastmod>${xml(updated)}</lastmod>` : ""}\n    <changefreq>weekly</changefreq>\n    <priority>${product.status === "active" ? "0.8" : "0.5"}</priority>\n  </url>`;
    })
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
}

export default async function handler(request, response) {
  try {
    if (request.method !== "GET" && request.method !== "HEAD") {
      response.setHeader("Allow", "GET, HEAD");
      return response.status(405).send("Method not allowed");
    }

    const products = await listProducts();
    response.setHeader("Content-Type", "application/xml; charset=utf-8");
    response.setHeader("Cache-Control", "public, s-maxage=300, stale-while-revalidate=3600");
    return response.status(200).send(renderSitemap(products));
  } catch (error) {
    console.error("Stock sitemap error", error);
    response.setHeader("Content-Type", "text/plain; charset=utf-8");
    response.setHeader("Cache-Control", "no-store");
    return response.status(error.status || 500).send("Stock sitemap temporarily unavailable");
  }
}

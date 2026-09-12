import { inventoryUsage, listInventoryEvents } from "./inventory-ledger.mjs";
const API_VERSION = "2022-11-28";
const DEFAULT_REPO = "robbd86/automation-outlet-site";
const STOCK_LABEL = "stock-item";
const MARKER_RE = /<!-- AO_STOCK_B64:([A-Za-z0-9+/=]+) -->/;

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
      "User-Agent": "automation-outlet-product-pages",
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

export async function listProducts() {
  const products = [];
  for (let page = 1; page <= 10; page += 1) {
    const issues = await github(
      `/issues?state=all&labels=${encodeURIComponent(STOCK_LABEL)}&per_page=100&page=${page}&sort=updated&direction=desc`
    );
    for (const issue of issues) {
      if (issue.pull_request) continue;
      const product = decodeData(issue.body);
      if (product) products.push({ ...product, issueNumber: issue.number, issueState: issue.state });
    }
    if (issues.length < 100) break;
  }
  const events = await listInventoryEvents();
  const usage = inventoryUsage(events);
  return products.map((product) => {
    const baseQuantity = Math.max(0, Number.parseInt(product.quantity, 10) || 0);
    const row = usage.get(product.id) || { reserved: 0, sold: 0 };
    return {
      ...product,
      baseQuantity,
      reservedQuantity: row.reserved,
      soldQuantity: row.sold,
      quantity: Math.max(0, baseQuantity - row.reserved - row.sold),
    };
  });
}


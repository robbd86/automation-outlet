import crypto from "node:crypto";

const API_VERSION = "2022-11-28";
const DEFAULT_REPO = "robbd86/automation-outlet-site";
const STOCK_LABEL = "stock-item";
const MARKER_RE = /<!-- AO_STOCK_B64:([A-Za-z0-9+/=]+) -->/;

function sendJson(response, status, body) {
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("Cache-Control", "no-store");
  response.status(status).json(body);
}

function secureEqual(left, right) {
  const a = Buffer.from(String(left || ""));
  const b = Buffer.from(String(right || ""));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function requireAdmin(request) {
  const expected = process.env.AO_DEAL_DESK_KEY;
  const supplied = request.headers["x-deal-desk-key"];
  return Boolean(expected && secureEqual(supplied, expected));
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

function decodeProduct(body) {
  const match = String(body || "").match(MARKER_RE);
  if (!match) return null;
  try {
    return JSON.parse(Buffer.from(match[1], "base64").toString("utf8"));
  } catch {
    return null;
  }
}

function encodeProduct(product) {
  return Buffer.from(JSON.stringify(product), "utf8").toString("base64");
}

function labelName(label) {
  return typeof label === "string" ? label : String(label?.name || "");
}

export default async function handler(request, response) {
  try {
    if (request.method !== "DELETE") {
      response.setHeader("Allow", "DELETE");
      return sendJson(response, 405, { error: "Method not allowed" });
    }

    if (!requireAdmin(request)) {
      return sendJson(response, 401, { error: "Invalid stock manager key" });
    }

    const issueNumber = Number(request.body?.issueNumber);
    if (!Number.isInteger(issueNumber) || issueNumber <= 0) {
      return sendJson(response, 400, { error: "Valid issueNumber is required" });
    }

    const issue = await github(`/issues/${issueNumber}`);
    const product = decodeProduct(issue.body);
    if (!product) {
      return sendJson(response, 404, { error: "Stock item data not found" });
    }

    const deletedAt = new Date().toISOString();
    const deletedProduct = {
      ...product,
      status: "deleted",
      quantity: 0,
      updatedAt: deletedAt,
      deletedAt,
    };
    const marker = `<!-- AO_STOCK_B64:${encodeProduct(deletedProduct)} -->`;
    const body = String(issue.body || "").replace(MARKER_RE, marker) +
      `\n\nArchived from the Automation Outlet Stock Manager on ${deletedAt}.`;
    const labels = (issue.labels || [])
      .map(labelName)
      .filter((name) => name && name !== STOCK_LABEL);
    const title = String(issue.title || "Stock item").startsWith("[DELETED]")
      ? issue.title
      : `[DELETED] ${issue.title || "Stock item"}`;

    await github(`/issues/${issueNumber}`, {
      method: "PATCH",
      body: JSON.stringify({
        title,
        body,
        labels,
        state: "closed",
        state_reason: "not_planned",
      }),
    });

    return sendJson(response, 200, { deleted: true, issueNumber });
  } catch (error) {
    console.error("Stock delete API error", error);
    return sendJson(response, error.status || 500, {
      error: error.status === 500 ? "Unexpected stock manager error" : error.message,
    });
  }
}

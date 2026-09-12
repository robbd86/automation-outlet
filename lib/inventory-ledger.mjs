import crypto from "node:crypto";

const API_VERSION = "2022-11-28";
const DEFAULT_REPO = "robbd86/automation-outlet-site";
const DEFAULT_LEDGER_ISSUE = 162;
const MARKER_RE = /<!-- AO_INV_B64:([A-Za-z0-9+/=]+) -->/;

function settings() {
  return {
    token: process.env.AO_GITHUB_TOKEN,
    repo: process.env.AO_GITHUB_REPO || DEFAULT_REPO,
    issue: Number(process.env.AO_INVENTORY_LEDGER_ISSUE || DEFAULT_LEDGER_ISSUE),
  };
}

async function github(path, options = {}) {
  const { token, repo } = settings();
  if (!token) {
    const error = new Error("Inventory ledger is not configured");
    error.status = 503;
    throw error;
  }
  const response = await fetch(`https://api.github.com/repos/${repo}${path}`, {
    ...options,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": API_VERSION,
      "User-Agent": "automation-outlet-inventory-ledger",
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

function encode(entry) {
  return Buffer.from(JSON.stringify(entry), "utf8").toString("base64");
}

function decode(comment) {
  const match = String(comment?.body || "").match(MARKER_RE);
  if (!match) return null;
  try {
    const data = JSON.parse(Buffer.from(match[1], "base64").toString("utf8"));
    return data && data.schema === 1 && data.reservationId ? { ...data, commentId: Number(comment.id) || 0 } : null;
  } catch {
    return null;
  }
}

function cleanItems(items) {
  return (Array.isArray(items) ? items : []).slice(0, 20).map((item) => ({
    stockId: String(item.stockId || "").slice(0, 160),
    partNumber: String(item.partNumber || "").slice(0, 120),
    quantity: Math.max(1, Math.min(99, Number.parseInt(item.quantity, 10) || 1)),
  })).filter((item) => item.stockId);
}

export function newReservationId() {
  return "aor_" + crypto.randomBytes(12).toString("hex");
}

export async function appendInventoryEvent(entry) {
  const { issue } = settings();
  const value = {
    schema: 1,
    kind: entry.kind,
    reservationId: String(entry.reservationId || ""),
    sessionId: entry.sessionId ? String(entry.sessionId) : null,
    eventId: entry.eventId ? String(entry.eventId) : null,
    createdAt: new Date().toISOString(),
    expiresAt: entry.expiresAt || null,
    items: cleanItems(entry.items),
  };
  if (!["reserve", "paid", "release"].includes(value.kind) || !value.reservationId) {
    throw new Error("Invalid inventory ledger event");
  }
  const body = `AO inventory ${value.kind}: ${value.reservationId}\n\n<!-- AO_INV_B64:${encode(value)} -->`;
  return github(`/issues/${issue}/comments`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ body }),
  });
}

export async function listInventoryEvents() {
  const { issue } = settings();
  const entries = [];
  for (let page = 1; page <= 20; page += 1) {
    const comments = await github(`/issues/${issue}/comments?per_page=100&page=${page}`);
    for (const comment of comments) {
      const entry = decode(comment);
      if (entry) entries.push(entry);
    }
    if (comments.length < 100) break;
  }
  return entries.sort((a, b) => a.commentId - b.commentId);
}

export function reservationStates(events, now = Date.now()) {
  const states = new Map();
  for (const event of events) {
    const current = states.get(event.reservationId);
    const firstCommentId = current?.firstCommentId || event.commentId;
    states.set(event.reservationId, { ...event, firstCommentId });
  }
  for (const [id, state] of states) {
    if (state.kind === "reserve" && state.expiresAt && Date.parse(state.expiresAt) <= now) {
      states.delete(id);
    }
  }
  return states;
}

export function inventoryUsage(events, now = Date.now()) {
  const states = reservationStates(events, now);
  const usage = new Map();
  for (const state of states.values()) {
    if (!["reserve", "paid"].includes(state.kind)) continue;
    for (const item of cleanItems(state.items)) {
      const row = usage.get(item.stockId) || { reserved: 0, sold: 0 };
      if (state.kind === "paid") row.sold += item.quantity;
      else row.reserved += item.quantity;
      usage.set(item.stockId, row);
    }
  }
  return usage;
}

export function reservationIsAllocated(baseQuantities, events, reservationId, now = Date.now()) {
  const states = [...reservationStates(events, now).values()]
    .filter((state) => ["reserve", "paid"].includes(state.kind))
    .sort((a, b) => a.firstCommentId - b.firstCommentId);
  const used = new Map();
  const allocated = new Set();

  for (const state of states) {
    const items = cleanItems(state.items);
    const fits = state.kind === "paid" || items.every((item) => {
      const base = Math.max(0, Number(baseQuantities.get(item.stockId)) || 0);
      return (used.get(item.stockId) || 0) + item.quantity <= base;
    });
    if (!fits) continue;
    allocated.add(state.reservationId);
    for (const item of items) used.set(item.stockId, (used.get(item.stockId) || 0) + item.quantity);
  }
  return allocated.has(reservationId);
}

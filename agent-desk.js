const API = "/api/agents";
const STOCK_API = "/api/stock";
const keyStore = "aoStockManagerKey";
let managerKey = sessionStorage.getItem(keyStore) || "";
let lastKind = "";
let lastResult = null;

const el = (id) => document.getElementById(id);
const gbp = new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP", maximumFractionDigits: 0 });

function setStatus(id, text, error = false) {
  const node = el(id);
  node.textContent = text;
  node.classList.toggle("error", error);
}

async function api(method = "GET", body = null, query = "") {
  const response = await fetch(API + query, {
    method,
    headers: {
      "Accept": "application/json",
      "Content-Type": "application/json",
      "x-deal-desk-key": managerKey,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Request failed");
  return data;
}

async function saveStockDraft(product) {
  const response = await fetch(STOCK_API, {
    method: "POST",
    headers: {
      "Accept": "application/json",
      "Content-Type": "application/json",
      "x-deal-desk-key": managerKey,
    },
    body: JSON.stringify(product),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Could not save draft");
  return data;
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (ch) => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
  }[ch]));
}

function showDesk() {
  el("lockPanel").classList.add("hidden");
  el("deskPanel").classList.remove("hidden");
}

function showLock() {
  el("deskPanel").classList.add("hidden");
  el("lockPanel").classList.remove("hidden");
  el("managerKey").value = "";
}

async function poll(sessionId, statusId) {
  for (let attempt = 0; attempt < 90; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, attempt === 0 ? 900 : 2200));
    const data = await api("GET", null, "?sessionId=" + encodeURIComponent(sessionId));
    if (data.status === "idle" && data.result) return data;
    if (data.status === "failed") throw new Error(data.error || "Agent run failed");
    if (data.status === "requires_action") throw new Error("Agent needs an unsupported action. Please retry.");
    const suffix = data.status === "in_progress" ? "Researching and drafting…" : "Working…";
    setStatus(statusId, suffix);
  }
  throw new Error("Agent run took too long. Try again.");
}

async function runAgent(kind, input, buttonId, statusId) {
  const button = el(buttonId);
  button.disabled = true;
  setStatus(statusId, "Starting agent…");
  try {
    const started = await api("POST", { kind, input });
    const finished = await poll(started.sessionId, statusId);
    lastKind = kind;
    lastResult = finished.result;
    renderResult(kind, finished.result, finished.usage);
    setStatus(statusId, "Complete.");
  } catch (error) {
    setStatus(statusId, error.message, true);
  } finally {
    button.disabled = false;
  }
}

function listHtml(items) {
  if (!Array.isArray(items) || !items.length) return "<p class='small'>None noted.</p>";
  return "<ul>" + items.map((item) => "<li>" + escapeHtml(item) + "</li>").join("") + "</ul>";
}

function renderListing(r, usage) {
  const checks = listHtml(r.checks);
  const seo = Array.isArray(r.seoKeywords) ? r.seoKeywords.map(escapeHtml).join(", ") : "";
  return `
    <span class="badge">LISTING DRAFT</span>
    <h2>${escapeHtml(r.listingTitle || r.partNumber || "Listing")}</h2>
    <p><strong>eBay title:</strong> ${escapeHtml(r.ebayTitle)}</p>
    <div class="kpis">
      <div class="kpi"><span>Recommended</span><b>${gbp.format(Number(r.recommendedPriceGbp || 0))}</b></div>
      <div class="kpi"><span>Low</span><b>${gbp.format(Number(r.priceLowGbp || 0))}</b></div>
      <div class="kpi"><span>High</span><b>${gbp.format(Number(r.priceHighGbp || 0))}</b></div>
    </div>
    <div class="result-section"><h3>Identification</h3><p>${escapeHtml(r.brand)} · ${escapeHtml(r.identification)}<br><span class="small">${escapeHtml(r.partNumber)} · ${escapeHtml(r.category)} · ${escapeHtml(r.condition)}</span></p></div>
    <div class="result-section"><h3>Description</h3><div class="desc">${escapeHtml(r.description)}</div></div>
    <div class="result-section"><h3>Pricing note</h3><p>${escapeHtml(r.pricingNotes)}</p></div>
    <div class="result-section"><h3>Checks before publishing</h3>${checks}</div>
    <div class="result-section"><h3>SEO keywords</h3><p class="small">${seo || "—"}</p></div>
    <div class="actions"><button class="btn" id="sendToStock" type="button">Save as website draft</button><button class="btn secondary" id="copyDescription" type="button">Copy description</button></div>
    <p class="small">Saving creates a hidden Stock Manager draft only. It will not publish until you review and activate it.${usage?.total_tokens ? ` Tokens: ${usage.total_tokens.toLocaleString("en-GB")}.` : ""}</p>
  `;
}

function renderDeal(r, usage) {
  const rows = Array.isArray(r.items) ? r.items.map((item) => `
    <div class="result-section"><h3>${escapeHtml(item.partNumber || item.identification)}</h3>
    <p>${escapeHtml(item.identification)} · Qty ${escapeHtml(item.quantity)}</p>
    <div class="kpis"><div class="kpi"><span>Sale each</span><b>${gbp.format(Number(item.realisticSaleGbpEach || 0))}</b></div><div class="kpi"><span>Trade each</span><b>${gbp.format(Number(item.tradeValueGbpEach || 0))}</b></div><div class="kpi"><span>Max buy each</span><b>${gbp.format(Number(item.maxBuyGbpEach || 0))}</b></div></div>
    <p class="small">${escapeHtml(item.notes)}</p></div>`).join("") : "";
  return `
    <span class="badge">${escapeHtml(String(r.recommendation || "").toUpperCase())}</span>
    <h2>Deal analysis</h2><p>${escapeHtml(r.summary)}</p>
    <div class="kpis"><div class="kpi"><span>Retail estimate</span><b>${gbp.format(Number(r.estimatedRetailGbp || 0))}</b></div><div class="kpi"><span>Trade estimate</span><b>${gbp.format(Number(r.estimatedTradeGbp || 0))}</b></div><div class="kpi"><span>Max cash buy</span><b>${gbp.format(Number(r.maxCashBuyGbp || 0))}</b></div></div>
    <p><strong>Confidence:</strong> ${escapeHtml(r.confidence)} · <strong>Suggested consignment ask:</strong> ${gbp.format(Number(r.suggestedConsignmentAskGbp || 0))}</p>
    ${rows}
    <div class="result-section"><h3>Risks</h3>${listHtml(r.risks)}</div>
    <div class="result-section"><h3>Next steps</h3>${listHtml(r.nextSteps)}</div>
    <p class="small">Commercial research aid only; verify unusually high-value parts before committing funds.${usage?.total_tokens ? ` Tokens: ${usage.total_tokens.toLocaleString("en-GB")}.` : ""}</p>
  `;
}

function renderResult(kind, result, usage) {
  el("resultEmpty").classList.add("hidden");
  el("result").innerHTML = kind === "listing" ? renderListing(result, usage) : renderDeal(result, usage);
  if (kind === "listing") {
    el("sendToStock").addEventListener("click", saveListingDraft);
    el("copyDescription").addEventListener("click", async () => {
      await navigator.clipboard.writeText(lastResult?.description || "");
      el("copyDescription").textContent = "Copied";
    });
  }
}

async function saveListingDraft() {
  if (!lastResult || lastKind !== "listing") return;
  const button = el("sendToStock");
  const r = lastResult;
  const draft = {
    title: r.listingTitle || "",
    partNumber: r.partNumber || "",
    brand: r.brand || "",
    category: r.category || "Other automation",
    condition: r.condition || "",
    priceGbp: Number(r.recommendedPriceGbp || 0),
    quantity: Number(r.quantity || 1),
    status: "draft",
    deliveryMode: r.deliveryMode || "quote",
    sortOrder: 100,
    imageUrl: "",
    ebayUrl: "",
    description: r.description || "",
    featured: false
  };

  button.disabled = true;
  button.textContent = "Saving…";
  try {
    await saveStockDraft(draft);
    button.textContent = "Draft saved";
    const open = document.createElement("a");
    open.className = "btn secondary";
    open.href = "/stock-admin.html";
    open.textContent = "Open Stock Manager";
    button.parentElement.appendChild(open);
  } catch (error) {
    button.disabled = false;
    button.textContent = "Save as website draft";
    alert(error.message);
  }
}

document.querySelectorAll(".tab").forEach((button) => {
  button.addEventListener("click", () => {
    const tab = button.dataset.tab;
    document.querySelectorAll(".tab").forEach((b) => b.classList.toggle("active", b === button));
    el("listingForm").classList.toggle("hidden", tab !== "listing");
    el("dealForm").classList.toggle("hidden", tab !== "deal");
  });
});

el("unlockForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  managerKey = el("managerKey").value;
  setStatus("unlockStatus", "Checking…");
  try {
    const health = await api("GET", null, "?health=1");
    sessionStorage.setItem(keyStore, managerKey);
    showDesk();
    setStatus("unlockStatus", "");
    if (!health.configured) setStatus("listingStatus", "OpenAI API key is unavailable in this deployment. Check the Vercel Preview environment.", true);
  } catch (error) {
    setStatus("unlockStatus", error.message, true);
  }
});

el("listingForm").addEventListener("submit", (event) => {
  event.preventDefault();
  runAgent("listing", {
    partNumber: el("listingPart").value.trim(),
    condition: el("listingCondition").value,
    quantity: Number(el("listingQty").value || 1),
    notes: el("listingNotes").value.trim()
  }, "listingRun", "listingStatus");
});

el("dealForm").addEventListener("submit", (event) => {
  event.preventDefault();
  runAgent("deal", {
    stock: el("dealStock").value.trim(),
    sellerAskGbp: el("dealAsk").value ? Number(el("dealAsk").value) : null,
    notes: el("dealNotes").value.trim()
  }, "dealRun", "dealStatus");
});

el("lockBtn").addEventListener("click", () => {
  sessionStorage.removeItem(keyStore);
  managerKey = "";
  showLock();
});

if (managerKey) {
  api("GET", null, "?health=1").then((health) => {
    showDesk();
    if (!health.configured) setStatus("listingStatus", "OpenAI API key is unavailable in this deployment. Check the Vercel Preview environment.", true);
  }).catch(() => {
    sessionStorage.removeItem(keyStore);
    managerKey = "";
    showLock();
  });
}

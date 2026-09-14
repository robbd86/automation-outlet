const API = "/api/agents";
const STOCK_API = "/api/stock";
const PHOTO_API = "/api/photo-agent";
const keyStore = "aoStockManagerKey";
let managerKey = sessionStorage.getItem(keyStore) || "";
let lastKind = "";
let lastResult = null;
let photoItems = [];
let photoReviewResult = null;
let brandedHeroDataUrl = "";
let uploadedHeroUrl = "";

const el = (id) => document.getElementById(id);
const gbp = new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP", maximumFractionDigits: 0 });

function setStatus(id, text, error = false) {
  const node = el(id);
  node.textContent = text;
  node.classList.toggle("error", error);
}

async function api(method = "GET", body = null, query = "") {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), method === "POST" ? 45000 : 20000);

  try {
    const response = await fetch(API + query, {
      method,
      headers: {
        "Accept": "application/json",
        "Content-Type": "application/json",
        "x-deal-desk-key": managerKey,
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "Request failed");
    return data;
  } catch (error) {
    if (error?.name === "AbortError") {
      throw new Error("Agent status request timed out. Please retry.");
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
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


async function photoApi(body) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 70000);
  try {
    const response = await fetch(PHOTO_API, {
      method: "POST",
      headers: {
        "Accept": "application/json",
        "Content-Type": "application/json",
        "x-deal-desk-key": managerKey,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "Photo Agent request failed");
    return data;
  } catch (error) {
    if (error?.name === "AbortError") throw new Error("Photo Agent timed out. Try fewer photos.");
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function readFileDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Could not read " + file.name));
    reader.readAsDataURL(file);
  });
}

function loadBrowserImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Could not decode image"));
    image.src = src;
  });
}

async function compressPhoto(file) {
  const src = await readFileDataUrl(file);
  const image = await loadBrowserImage(src);
  const max = 1200;
  const scale = Math.min(1, max / Math.max(image.naturalWidth || image.width, image.naturalHeight || image.height));
  const width = Math.max(1, Math.round((image.naturalWidth || image.width) * scale));
  const height = Math.max(1, Math.round((image.naturalHeight || image.height) * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(image, 0, 0, width, height);
  return {
    name: file.name,
    dataUrl: canvas.toDataURL("image/jpeg", 0.72),
    width,
    height,
  };
}

function renderPhotoGrid() {
  const grid = el("photoGrid");
  if (!photoItems.length) {
    grid.innerHTML = "";
    grid.classList.add("hidden");
    return;
  }
  grid.classList.remove("hidden");
  const hero = Number(photoReviewResult?.heroIndex ?? -1);
  grid.innerHTML = photoItems.map((item, index) => {
    const review = photoReviewResult?.imageReviews?.find((x) => Number(x.index) === index);
    const tag = index === hero ? "HERO" : (review?.role ? String(review.role).toUpperCase() : String(index + 1));
    return '<div class="photo-thumb' + (index === hero ? ' hero' : '') + '">' +
      '<img src="' + item.dataUrl + '" alt="Product photo ' + (index + 1) + '">' +
      '<span class="photo-tag">' + escapeHtml(tag) + '</span></div>';
  }).join("");
}

function listInline(items) {
  return Array.isArray(items) && items.length ? items.map(escapeHtml).join(", ") : "None noted";
}

function drawContain(ctx, image, x, y, w, h) {
  const ratio = Math.min(w / image.width, h / image.height);
  const dw = image.width * ratio;
  const dh = image.height * ratio;
  ctx.drawImage(image, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
}

async function buildBrandedHero(heroIndex) {
  const item = photoItems[heroIndex];
  if (!item) return "";
  const image = await loadBrowserImage(item.dataUrl);
  const canvas = document.createElement("canvas");
  canvas.width = 1600;
  canvas.height = 1600;
  const ctx = canvas.getContext("2d");

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, 1600, 1600);

  ctx.strokeStyle = "#dbe9fb";
  ctx.lineWidth = 5;
  [[1220,105,1500,105],[1320,165,1540,165],[108,1240,330,1240],[108,1300,405,1300]].forEach(([x1,y1,x2,y2]) => {
    ctx.beginPath(); ctx.moveTo(x1,y1); ctx.lineTo(x2,y2); ctx.stroke();
    ctx.beginPath(); ctx.arc(x2,y2,10,0,Math.PI*2); ctx.stroke();
  });

  ctx.fillStyle = "#081b35";
  ctx.beginPath(); ctx.moveTo(1325,0); ctx.lineTo(1600,0); ctx.lineTo(1600,275); ctx.closePath(); ctx.fill();
  ctx.fillStyle = "#1876f2";
  ctx.beginPath(); ctx.moveTo(1415,0); ctx.lineTo(1600,0); ctx.lineTo(1600,185); ctx.closePath(); ctx.fill();
  ctx.fillStyle = "#081b35";
  ctx.beginPath(); ctx.moveTo(0,1430); ctx.lineTo(0,1600); ctx.lineTo(360,1600); ctx.closePath(); ctx.fill();
  ctx.fillStyle = "#1876f2";
  ctx.beginPath(); ctx.moveTo(0,1510); ctx.lineTo(0,1600); ctx.lineTo(190,1600); ctx.closePath(); ctx.fill();

  ctx.save();
  ctx.shadowColor = "rgba(7,17,31,.18)";
  ctx.shadowBlur = 28;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(115, 235, 1370, 990);
  ctx.restore();
  drawContain(ctx, image, 145, 265, 1310, 930);

  try {
    const logo = await loadBrowserImage("/ao-site-logo.svg");
    drawContain(ctx, logo, 75, 55, 480, 140);
  } catch {}

  const part = (photoReviewResult?.detectedPartNumber || el("listingPart").value.trim() || "INDUSTRIAL AUTOMATION").toUpperCase();
  ctx.fillStyle = "#071b35";
  ctx.font = "700 54px Arial, sans-serif";
  ctx.fillText(part.slice(0, 38), 105, 1335);

  const badges = ["AO LISTING", "FAST RESPONSE", "INDUSTRIAL AUTOMATION"];
  ctx.font = "700 29px Arial, sans-serif";
  badges.forEach((label, i) => {
    const x = 105 + i * 475;
    ctx.strokeStyle = "#b9d2ef";
    ctx.lineWidth = 3;
    ctx.strokeRect(x, 1395, 420, 100);
    ctx.fillStyle = "#1876f2";
    ctx.beginPath(); ctx.arc(x + 48, 1445, 18, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#071b35";
    ctx.fillText(label, x + 82, 1455);
  });

  const output = document.createElement("canvas");
  output.width = 1200;
  output.height = 1200;
  output.getContext("2d").drawImage(canvas, 0, 0, 1200, 1200);
  return output.toDataURL("image/jpeg", 0.78);
}

function downloadDataUrl(dataUrl, filename) {
  const a = document.createElement("a");
  a.href = dataUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

function photoNotesForListing() {
  if (!photoReviewResult) return "";
  const r = photoReviewResult;
  const parts = [];
  if (r.detectedPartNumber) parts.push("Photo label reads: " + r.detectedPartNumber + (r.detectedRevision ? " (" + r.detectedRevision + ")" : ""));
  if (Array.isArray(r.visibleSpecs) && r.visibleSpecs.length) parts.push("Visible specs: " + r.visibleSpecs.join("; "));
  if (Array.isArray(r.accessoriesVisible) && r.accessoriesVisible.length) parts.push("Visible accessories: " + r.accessoriesVisible.join("; "));
  if (Array.isArray(r.conditionNotes) && r.conditionNotes.length) parts.push("Photo condition notes: " + r.conditionNotes.join("; "));
  if (Array.isArray(r.damageNotes) && r.damageNotes.length) parts.push("Visible damage/concerns: " + r.damageNotes.join("; "));
  if (r.listingNotesAppend) parts.push(r.listingNotesAppend);
  return parts.join("\n");
}

async function renderPhotoReview() {
  const box = el("photoReview");
  if (!photoReviewResult) {
    box.classList.add("hidden");
    box.innerHTML = "";
    return;
  }

  brandedHeroDataUrl = await buildBrandedHero(Number(photoReviewResult.heroIndex || 0));
  uploadedHeroUrl = "";
  renderPhotoGrid();

  const r = photoReviewResult;
  const mismatch = r.detectedPartNumber && el("listingPart").value.trim() &&
    r.detectedPartNumber.toUpperCase() !== el("listingPart").value.trim().toUpperCase();

  box.classList.remove("hidden");
  box.innerHTML =
    '<p><strong>Detected:</strong> ' + escapeHtml(r.detectedBrand || "—") + ' · ' + escapeHtml(r.detectedPartNumber || "Part number not clear") +
    (r.detectedRevision ? ' · ' + escapeHtml(r.detectedRevision) : '') + ' · <strong>Confidence:</strong> ' + escapeHtml(r.confidence || "—") + '</p>' +
    (mismatch ? '<p style="color:#ffb4b4"><strong>Check:</strong> Photo part number does not match the typed part number.</p>' : '') +
    '<p><strong>Hero:</strong> Photo ' + (Number(r.heroIndex || 0) + 1) + ' — ' + escapeHtml(r.heroReason || "") + '</p>' +
    '<p><strong>Visible specs:</strong> ' + listInline(r.visibleSpecs) + '</p>' +
    '<p><strong>Accessories:</strong> ' + listInline(r.accessoriesVisible) + '</p>' +
    '<p><strong>Missing shots:</strong> ' + listInline(r.missingShots) + '</p>' +
    (brandedHeroDataUrl ? '<div class="photo-hero-preview"><img src="' + brandedHeroDataUrl + '" alt="AO branded hero preview"></div>' +
      '<div class="photo-actions"><button class="btn secondary" id="downloadHero" type="button">Download branded hero</button></div>' : '');

  if (!el("listingPart").value.trim() && r.detectedPartNumber) el("listingPart").value = r.detectedPartNumber;
  if (el("downloadHero")) {
    el("downloadHero").addEventListener("click", () => {
      const name = safeFilename(r.detectedPartNumber || el("listingPart").value || "ao-listing") + "-AO-hero.jpg";
      downloadDataUrl(brandedHeroDataUrl, name);
    });
  }
}

function safeFilename(value) {
  return String(value || "ao-listing").replace(/[^a-z0-9_-]+/gi, "-").replace(/^-+|-+$/g, "").slice(0, 80);
}

async function clearPhotos() {
  photoItems = [];
  photoReviewResult = null;
  brandedHeroDataUrl = "";
  uploadedHeroUrl = "";
  el("listingPhotos").value = "";
  el("photoAnalyse").disabled = true;
  el("photoClear").disabled = true;
  setStatus("photoStatus", "");
  el("photoReview").innerHTML = "";
  el("photoReview").classList.add("hidden");
  renderPhotoGrid();
}

async function resetListingForNext() {
  const previousCondition = el("listingCondition").value;
  const keepCondition = Boolean(el("keepCondition")?.checked);
  const autoDraft = Boolean(el("photoAutoDraft")?.checked);

  el("listingForm").reset();
  el("listingQty").value = "1";
  if (el("keepCondition")) el("keepCondition").checked = keepCondition;
  if (el("photoAutoDraft")) el("photoAutoDraft").checked = autoDraft;
  if (keepCondition) el("listingCondition").value = previousCondition;

  await clearPhotos();
  lastKind = "";
  lastResult = null;
  el("result").innerHTML = "";
  el("resultEmpty").classList.remove("hidden");
  setStatus("listingStatus", "Ready for next item.");
  window.scrollTo({ top: 0, behavior: "smooth" });
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
  const startedAt = Date.now();

  for (let attempt = 0; attempt < 90; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, attempt === 0 ? 900 : 2200));
    const data = await api("GET", null, "?sessionId=" + encodeURIComponent(sessionId));

    if (data.status === "idle" && data.result) return data;
    if (data.status === "failed") throw new Error(data.error || "Agent run failed");
    if (data.status === "requires_action") throw new Error("Agent needs an unsupported action. Please retry.");

    const seconds = Math.max(1, Math.round((Date.now() - startedAt) / 1000));
    const turn = data.turnStatus ? " · " + data.turnStatus.replaceAll("_", " ") : "";
    setStatus(statusId, "Researching and drafting… " + seconds + "s" + turn);
  }

  throw new Error("Agent run exceeded about 3 minutes. It may still be processing at OpenAI; wait a minute before retrying to avoid duplicate API spend.");
}

function isTransientAgentError(error) {
  const message = String(error?.message || "").toLowerCase();
  return message.includes("internal error") ||
    message.includes("server error") ||
    message.includes("temporarily unavailable");
}

async function runAgent(kind, input, buttonId, statusId) {
  const button = el(buttonId);
  button.disabled = true;
  setStatus(statusId, "Starting agent…");

  try {
    let finished = null;

    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const started = await api("POST", { kind, input });
        finished = await poll(started.sessionId, statusId);
        break;
      } catch (error) {
        if (attempt === 0 && isTransientAgentError(error)) {
          setStatus(statusId, "OpenAI had a temporary internal error — retrying once…");
          await new Promise((resolve) => setTimeout(resolve, 1200));
          continue;
        }
        throw error;
      }
    }

    if (!finished?.result) throw new Error("Agent run did not return a result.");

    lastKind = kind;
    lastResult = finished.result;
    renderResult(kind, finished.result, finished.usage, finished.model, finished.cache, finished.cacheAgeHours);
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

function safeExternalUrl(value) {
  try {
    const url = new URL(String(value || ""));
    return url.protocol === "https:" || url.protocol === "http:" ? url.href : "";
  } catch {
    return "";
  }
}

function marketEvidenceHtml(items) {
  if (!Array.isArray(items) || !items.length) {
    return "<p class='small'>No strong comparable links returned.</p>";
  }

  return items.slice(0, 4).map((item) => {
    const url = safeExternalUrl(item.url);
    const source = escapeHtml(item.source || "Source");
    const condition = escapeHtml(item.condition || "");
    const type = escapeHtml(item.evidenceType || "");
    const warranty = escapeHtml(item.warrantyService || "No service note");
    const price = gbp.format(Number(item.priceGbp || 0));
    const link = url
      ? '<a href="' + escapeHtml(url) + '" target="_blank" rel="noopener noreferrer">Open source</a>'
      : '<span class="small">No link</span>';

    return '<div class="evidence-item">' +
      '<p><strong>' + source + ' · ' + price + '</strong></p>' +
      '<p class="small">' + condition + ' · ' + type + '</p>' +
      '<p class="small">' + warranty + ' · ' + link + '</p>' +
      '</div>';
  }).join("");
}

function photoUsageSummary(usage) {
  const input = Number(usage?.input_tokens || 0);
  const output = Number(usage?.output_tokens || 0);
  const total = Number(usage?.total_tokens || (input + output) || 0);
  if (!total) return "";
  const dollars = (input * 0.20 + output * 1.20) / 1000000;
  return total.toLocaleString("en-GB") + " tokens · est. model cost ≈ $" +
    dollars.toFixed(dollars < 0.01 ? 4 : 3);
}

function usageSummary(usage, model, cache, cacheAgeHours) {
  const input = Number(usage?.input_tokens || 0);
  const output = Number(usage?.output_tokens || 0);
  const cachedInput = Math.min(
    input,
    Number(usage?.input_tokens_details?.cached_tokens || 0)
  );
  const uncachedInput = Math.max(0, input - cachedInput);
  const total = Number(usage?.total_tokens || (input + output) || 0);

  const label = model === "gpt-5.6-luna" ? "GPT-5.6 Luna" :
    model === "gpt-5.6-terra" ? "GPT-5.6 Terra" :
    (model || "OpenAI");

  let text = "Model: " + label;

  if (total) {
    text += " · Tokens: " + total.toLocaleString("en-GB");
    if (input || output) {
      text += " (in " + input.toLocaleString("en-GB") +
        " / out " + output.toLocaleString("en-GB");
      if (cachedInput) text += " / cached " + cachedInput.toLocaleString("en-GB");
      text += ")";
    }
  } else {
    text += " · Tokens: usage unavailable";
  }

  const rates = model === "gpt-5.6-luna"
    ? { input: 0.20, cached: 0.02, output: 1.20 }
    : model === "gpt-5.6-terra"
      ? { input: 2.00, cached: 0.20, output: 12.00 }
      : null;

  if (rates && (input || output)) {
    const dollars = (
      uncachedInput * rates.input +
      cachedInput * rates.cached +
      output * rates.output
    ) / 1000000;
    text += " · Est. model cost ≈ $" + dollars.toFixed(dollars < 0.01 ? 4 : 3);
  }

  if (cache === "hit") {
    const age = Number.isFinite(Number(cacheAgeHours)) ? " · " + Number(cacheAgeHours) + "h old" : "";
    text += " · Cached research" + age + " · no web-search charge";
  } else if (cache === "miss") {
    text += " · Fresh research + web-search charges";
  } else if (model) {
    text += " + web-search charges";
  }
  return text;
}

function renderListing(r, usage, model, cache, cacheAgeHours) {
  const checks = listHtml(r.checks);
  const seo = Array.isArray(r.seoKeywords) ? r.seoKeywords.map(escapeHtml).join(", ") : "";
  const evidence = marketEvidenceHtml(r.marketEvidence);
  return `
    <span class="badge">LISTING DRAFT</span>
    <h2>${escapeHtml(r.listingTitle || r.partNumber || "Listing")}</h2>
    <p><strong>eBay title:</strong> ${escapeHtml(r.ebayTitle)}</p>
    <div class="kpis">
      <div class="kpi"><span>Recommended ask</span><b>${gbp.format(Number(r.recommendedPriceGbp || 0))}</b></div>
      <div class="kpi"><span>Quick sale</span><b>${gbp.format(Number(r.priceLowGbp || 0))}</b></div>
      <div class="kpi"><span>Stretch high</span><b>${gbp.format(Number(r.priceHighGbp || 0))}</b></div>
    </div>
    <p><strong>Pricing confidence:</strong> ${escapeHtml(r.pricingConfidence || "—")}</p>
    <div class="result-section"><h3>Identification</h3><p>${escapeHtml(r.brand)} · ${escapeHtml(r.identification)}<br><span class="small">${escapeHtml(r.partNumber)} · ${escapeHtml(r.category)} · ${escapeHtml(r.condition)}</span></p></div>
    <div class="result-section"><h3>Description</h3><div class="desc">${escapeHtml(r.description)}</div></div>
    <div class="result-section"><h3>Pricing note</h3><p>${escapeHtml(r.pricingNotes)}</p></div>
    <div class="result-section"><h3>Market evidence</h3>${evidence}</div>
    <div class="result-section"><h3>Checks before publishing</h3>${checks}</div>
    <div class="result-section"><h3>SEO keywords</h3><p class="small">${seo || "—"}</p></div>
    <div class="actions"><button class="btn" id="sendToStock" type="button">Save as website draft</button><button class="btn secondary" id="saveNext" type="button">Save draft & next item</button><button class="btn secondary" id="copyEbayTitle" type="button">Copy eBay title</button><button class="btn secondary" id="copyDescription" type="button">Copy description</button></div>
    <p class="small">Saving creates a hidden Stock Manager draft only. It will not publish until you review and activate it.<br>${escapeHtml(usageSummary(usage, model, cache, cacheAgeHours))}</p>
  `;
}

function renderDeal(r, usage, model) {
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
    <p class="small">Commercial research aid only; verify unusually high-value parts before committing funds.<br>${escapeHtml(usageSummary(usage, model))}</p>
  `;
}

function renderResult(kind, result, usage, model, cache, cacheAgeHours) {
  el("resultEmpty").classList.add("hidden");
  el("result").innerHTML = kind === "listing"
    ? renderListing(result, usage, model, cache, cacheAgeHours)
    : renderDeal(result, usage, model);
  if (kind === "listing") {
    el("sendToStock").addEventListener("click", () => saveListingDraft(false));
    el("saveNext").addEventListener("click", () => saveListingDraft(true));
    el("copyEbayTitle").addEventListener("click", async () => {
      await navigator.clipboard.writeText(lastResult?.ebayTitle || "");
      el("copyEbayTitle").textContent = "Copied";
    });
    el("copyDescription").addEventListener("click", async () => {
      await navigator.clipboard.writeText(lastResult?.description || "");
      el("copyDescription").textContent = "Copied";
    });
  }
}

async function saveListingDraft(moveNext = false) {
  if (!lastResult || lastKind !== "listing") return;
  const button = moveNext ? el("saveNext") : el("sendToStock");
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
    imageUrl: uploadedHeroUrl || "",
    ebayUrl: "",
    description: r.description || "",
    featured: false
  };

  button.disabled = true;
  button.textContent = brandedHeroDataUrl && !uploadedHeroUrl ? "Uploading hero…" : "Saving…";
  try {
    let heroWarning = "";
    if (brandedHeroDataUrl && !uploadedHeroUrl) {
      try {
        const uploaded = await photoApi({
          action: "upload-hero",
          partNumber: r.partNumber || el("listingPart").value.trim(),
          dataUrl: brandedHeroDataUrl
        });
        uploadedHeroUrl = uploaded.url || "";
        draft.imageUrl = uploadedHeroUrl;
      } catch (heroError) {
        console.warn("AO hero upload failed; saving draft without image", heroError);
        heroWarning = "Hero image could not be stored, but the website draft was saved without an image.";
        draft.imageUrl = "";
      }
      button.textContent = "Saving…";
    }
    await saveStockDraft(draft);
    button.textContent = heroWarning ? "Draft saved – image pending" : "Draft saved";
    if (heroWarning) setStatus("listingStatus", heroWarning, true);
    const open = document.createElement("a");
    open.className = "btn secondary";
    open.href = "/stock-admin.html";
    open.textContent = "Open Stock Manager";
    button.parentElement.appendChild(open);
    if (moveNext) {
      await new Promise((resolve) => setTimeout(resolve, 450));
      await resetListingForNext();
    }
  } catch (error) {
    button.disabled = false;
    button.textContent = moveNext ? "Save draft & next item" : "Save as website draft";
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

async function runListingFromForm() {
  const partNumber = el("listingPart").value.trim();
  const condition = el("listingCondition").value;

  if (!partNumber) {
    setStatus("listingStatus", "Add a part number or review a clear label photo first.", true);
    return false;
  }
  if (!condition) {
    setStatus("listingStatus", "Choose the item condition before drafting.", true);
    return false;
  }

  const photoNotes = photoNotesForListing();
  const userNotes = el("listingNotes").value.trim();
  await runAgent("listing", {
    partNumber,
    condition,
    quantity: Number(el("listingQty").value || 1),
    notes: [userNotes, photoNotes].filter(Boolean).join("\n\n")
  }, "listingRun", "listingStatus");
  return true;
}

el("listingForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  await runListingFromForm();
});


el("listingPhotos").addEventListener("change", async (event) => {
  const files = Array.from(event.target.files || []).slice(0, 8);
  if (!files.length) return clearPhotos();
  setStatus("photoStatus", "Preparing " + files.length + " photo" + (files.length === 1 ? "" : "s") + "…");
  el("photoAnalyse").disabled = true;
  try {
    photoItems = [];
    for (let i = 0; i < files.length; i += 1) {
      setStatus("photoStatus", "Preparing photo " + (i + 1) + " of " + files.length + "…");
      photoItems.push(await compressPhoto(files[i]));
    }
    photoReviewResult = null;
    brandedHeroDataUrl = "";
    uploadedHeroUrl = "";
    renderPhotoGrid();
    el("photoAnalyse").disabled = false;
    el("photoClear").disabled = false;
    setStatus("photoStatus", files.length + " photos ready. Tap Review photos.");
  } catch (error) {
    setStatus("photoStatus", error.message, true);
  }
});

el("photoAnalyse").addEventListener("click", async () => {
  if (!photoItems.length) return;
  const button = el("photoAnalyse");
  button.disabled = true;
  setStatus("photoStatus", "Reading labels and choosing the best photo…");
  try {
    const data = await photoApi({
      action: "analyse",
      partNumber: el("listingPart").value.trim(),
      condition: el("listingCondition").value,
      images: photoItems.map((item) => ({ name: item.name, dataUrl: item.dataUrl }))
    });
    photoReviewResult = data.review;
    await renderPhotoReview();
    const usage = photoUsageSummary(data.usage);
    const usageText = usage ? " · " + usage : "";
    const partNumber = el("listingPart").value.trim();
    const condition = el("listingCondition").value;

    if (el("photoAutoDraft")?.checked) {
      if (!partNumber) {
        setStatus("photoStatus", "Photo review complete, but the part number was not clear. Enter it manually." + usageText, true);
      } else if (!condition) {
        setStatus("photoStatus", "Photo review complete. Choose a condition to draft the listing." + usageText);
      } else {
        setStatus("photoStatus", "Photo review complete. Starting listing automatically…" + usageText);
        await runListingFromForm();
      }
    } else {
      setStatus("photoStatus", "Photo review complete. Hero image prepared automatically." + usageText);
    }
  } catch (error) {
    setStatus("photoStatus", error.message, true);
  } finally {
    button.disabled = false;
  }
});

el("photoClear").addEventListener("click", clearPhotos);

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

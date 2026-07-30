const state = {
  key: sessionStorage.getItem("aoDealDeskKey") || "",
  enquiries: [],
  selectedIssue: null,
};

const loginSection = document.getElementById("deskLogin");
const appSection = document.getElementById("deskApp");
const loginForm = document.getElementById("loginForm");
const loginStatus = document.getElementById("loginStatus");
const lockButton = document.getElementById("lockDesk");
const listEl = document.getElementById("dealList");
const panelEl = document.getElementById("dealPanel");
const metricsEl = document.getElementById("deskMetrics");
const emptyEl = document.getElementById("deskEmpty");
const searchEl = document.getElementById("deskSearch");
const statusFilter = document.getElementById("statusFilter");
const routeFilter = document.getElementById("routeFilter");

const statusNames = {
  new: "New",
  reviewing: "Reviewing",
  "offer-ready": "Offer ready",
  "offer-sent": "Offer sent",
  negotiating: "Negotiating",
  won: "Stock secured",
  consignment: "Consignment agreed",
  declined: "Declined",
  closed: "Closed",
};

const routeNames = {
  "best-option": "Best option",
  cash: "Cash sale",
  "revenue-share": "Revenue share",
};

function esc(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function gbp(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0
    ? new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(number)
    : "—";
}

function dateLabel(value) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric" }).format(date);
}

async function api(method = "GET", body) {
  const response = await fetch("/api/deal-desk", {
    method,
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "X-Deal-Desk-Key": state.key,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Deal desk request failed");
  return data;
}

function showApp() {
  loginSection.hidden = true;
  appSection.hidden = false;
  lockButton.hidden = false;
}

function lockDesk() {
  state.key = "";
  state.enquiries = [];
  state.selectedIssue = null;
  sessionStorage.removeItem("aoDealDeskKey");
  appSection.hidden = true;
  loginSection.hidden = false;
  lockButton.hidden = true;
  document.getElementById("deskKey").value = "";
  loginStatus.textContent = "";
}

async function loadDesk() {
  const button = document.getElementById("refreshDesk");
  button.disabled = true;
  button.textContent = "Loading…";
  try {
    const data = await api("GET");
    state.enquiries = data.enquiries || [];
    showApp();
    render();
    if (state.selectedIssue) selectEnquiry(state.selectedIssue);
  } finally {
    button.disabled = false;
    button.textContent = "Refresh";
  }
}

function filteredEnquiries() {
  const query = searchEl.value.trim().toLowerCase();
  return state.enquiries.filter((entry) => {
    const admin = entry.admin || {};
    if (statusFilter.value && admin.status !== statusFilter.value) return false;
    if (routeFilter.value && entry.preference !== routeFilter.value) return false;
    if (!query) return true;
    const haystack = [
      entry.reference,
      entry.contact?.name,
      entry.contact?.company,
      entry.contact?.email,
      entry.postcode,
      entry.notes,
      ...(entry.items || []).flatMap((item) => [
        item.manufacturer, item.partNumber, item.equipmentType, item.condition,
      ]),
    ].join(" ").toLowerCase();
    return haystack.includes(query);
  });
}

function renderMetrics() {
  const open = state.enquiries.filter((entry) =>
    !["won", "consignment", "declined", "closed"].includes(entry.admin?.status)
  );
  const offerValue = state.enquiries.reduce(
    (sum, entry) => sum + (Number(entry.admin?.recommendedOfferGbp) || 0), 0
  );
  const resaleValue = state.enquiries.reduce(
    (sum, entry) => sum + (Number(entry.admin?.estimatedResaleGbp) || 0), 0
  );
  const high = state.enquiries.filter((entry) =>
    ["high", "urgent"].includes(entry.admin?.priority)
  ).length;
  metricsEl.innerHTML = [
    ["Open opportunities", open.length],
    ["High priority", high],
    ["Proposed cash", gbp(offerValue)],
    ["Estimated resale", gbp(resaleValue)],
  ].map(([label, value]) => `
    <div class="desk-metric"><span>${label}</span><strong>${value}</strong></div>
  `).join("");
}

function itemSummary(entry) {
  const first = entry.items?.[0] || {};
  const label = [first.manufacturer, first.partNumber || first.equipmentType]
    .filter(Boolean).join(" ");
  const extra = Math.max(0, (entry.items?.length || 0) - 1);
  return `${label || "Equipment details supplied"}${extra ? ` + ${extra} more` : ""}`;
}

function renderList() {
  const rows = filteredEnquiries();
  emptyEl.hidden = rows.length !== 0;
  listEl.innerHTML = rows.map((entry) => {
    const admin = entry.admin || {};
    const selected = entry.issueNumber === state.selectedIssue ? " selected" : "";
    return `
      <button class="deal-card${selected}" type="button" data-issue="${entry.issueNumber}">
        <div class="deal-card-top">
          <span class="deal-ref">${esc(entry.reference)}</span>
          <span class="status-pill status-${esc(admin.status || "new")}">${esc(statusNames[admin.status] || "New")}</span>
        </div>
        <h3>${esc(entry.contact?.company || entry.contact?.name || "Seller enquiry")}</h3>
        <p>${esc(itemSummary(entry))}</p>
        <div class="deal-card-meta">
          <span>${esc(routeNames[entry.preference] || "Best option")}</span>
          <span>${esc(entry.postcode || "Location not stated")}</span>
          <span>${dateLabel(entry.submittedAt)}</span>
        </div>
      </button>
    `;
  }).join("");

  listEl.querySelectorAll(".deal-card").forEach((button) => {
    button.addEventListener("click", () => selectEnquiry(Number(button.dataset.issue)));
  });
}

function render() {
  renderMetrics();
  renderList();
}

function calculateOffer() {
  const resale = Number(document.getElementById("v-resale")?.value || 0);
  const feePercent = Number(document.getElementById("v-fees")?.value || 15.42);
  const shipping = Number(document.getElementById("v-shipping")?.value || 0);
  const testing = Number(document.getElementById("v-testing")?.value || 0);
  const targetProfit = Number(document.getElementById("v-profit")?.value || 0);
  const fees = resale * feePercent / 100;
  const offer = Math.max(0, resale - fees - shipping - testing - targetProfit);
  const offerInput = document.getElementById("v-offer");
  if (offerInput) offerInput.value = offer ? offer.toFixed(2) : "";
  const result = document.getElementById("valuationResult");
  if (result) {
    const roi = offer > 0 ? targetProfit / offer * 100 : 0;
    result.innerHTML = `
      <span>Estimated selling fees <b>${gbp(fees)}</b></span>
      <span>Maximum cash offer <b>${gbp(offer)}</b></span>
      <span>Target return on cash <b>${roi.toFixed(0)}%</b></span>
    `;
  }
}

function itemTable(items) {
  return `
    <div class="panel-items">
      ${(items || []).map((item) => `
        <div>
          <strong>${esc(item.quantity || 1)} × ${esc(item.manufacturer || item.equipmentType || "Item")}</strong>
          <span>${esc(item.partNumber || item.equipmentType || "Part number not stated")}</span>
          <small>${esc(item.condition || "Condition not stated")}</small>
        </div>
      `).join("")}
    </div>
  `;
}

function selectEnquiry(issueNumber) {
  state.selectedIssue = issueNumber;
  const entry = state.enquiries.find((row) => row.issueNumber === issueNumber);
  if (!entry) return;
  renderList();

  const admin = entry.admin || {};
  panelEl.innerHTML = `
    <div class="panel-head">
      <div>
        <span class="deal-ref">${esc(entry.reference)}</span>
        <h2>${esc(entry.contact?.company || entry.contact?.name)}</h2>
      </div>
      <a href="${esc(entry.issueUrl)}" target="_blank" rel="noopener">Open record</a>
    </div>

    <div class="panel-section seller-summary">
      <h3>Seller</h3>
      <p><b>${esc(entry.contact?.name)}</b> · ${esc(entry.contact?.phone)} · <a href="mailto:${esc(entry.contact?.email)}">${esc(entry.contact?.email)}</a></p>
      <p>${esc(entry.sellerType || "Seller type not stated")} · ${esc(entry.postcode || "Location not stated")}</p>
      <p>${esc(routeNames[entry.preference] || "Best option")} · ${esc(entry.urgency || "Flexible")} · Expected ${gbp(entry.expectedPriceGbp)}</p>
      <p>${esc(entry.logistics || "Logistics not stated")} · ${esc(entry.availability || "")}</p>
    </div>

    <div class="panel-section">
      <h3>Equipment</h3>
      ${itemTable(entry.items)}
      <p class="seller-notes">${esc(entry.notes || "No seller notes supplied.")}</p>
    </div>

    <form id="dealForm" class="panel-section deal-form">
      <h3>Deal decision</h3>
      <div class="panel-grid">
        <div class="field">
          <label for="v-status">Status</label>
          <select id="v-status">
            ${Object.entries(statusNames).map(([value, label]) =>
              `<option value="${value}" ${admin.status === value ? "selected" : ""}>${label}</option>`
            ).join("")}
          </select>
        </div>
        <div class="field">
          <label for="v-priority">Priority</label>
          <select id="v-priority">
            ${["low", "normal", "high", "urgent"].map((value) =>
              `<option value="${value}" ${admin.priority === value ? "selected" : ""}>${value[0].toUpperCase() + value.slice(1)}</option>`
            ).join("")}
          </select>
        </div>
        <div class="field">
          <label for="v-resale">Estimated resale</label>
          <div class="money-field"><span>£</span><input id="v-resale" type="number" min="0" step="1" value="${admin.estimatedResaleGbp || ""}"></div>
        </div>
        <div class="field">
          <label for="v-offer">Recommended cash offer</label>
          <div class="money-field"><span>£</span><input id="v-offer" type="number" min="0" step="1" value="${admin.recommendedOfferGbp || ""}"></div>
        </div>
        <div class="field">
          <label for="v-share">Seller revenue share %</label>
          <input id="v-share" type="number" min="0" max="100" step="1" value="${admin.revenueSharePercent || ""}">
        </div>
        <div class="field">
          <label for="v-follow">Next follow-up</label>
          <input id="v-follow" type="date" value="${esc(admin.nextFollowUp || "")}">
        </div>
      </div>

      <details class="valuation-box">
        <summary>Cash-offer calculator</summary>
        <div class="panel-grid calc-grid">
          <div class="field"><label for="v-fees">Selling fees %</label><input id="v-fees" type="number" step=".01" value="15.42"></div>
          <div class="field"><label for="v-shipping">Shipping / handling</label><input id="v-shipping" type="number" min="0" value="10"></div>
          <div class="field"><label for="v-testing">Testing / return allowance</label><input id="v-testing" type="number" min="0" value="20"></div>
          <div class="field"><label for="v-profit">Required net profit</label><input id="v-profit" type="number" min="0" value="100"></div>
        </div>
        <button type="button" id="calculateOffer" class="btn ghost">Calculate maximum offer</button>
        <div id="valuationResult" class="valuation-result"></div>
      </details>

      <div class="field">
        <label for="v-notes">Internal notes</label>
        <textarea id="v-notes" placeholder="Research, seller expectations, selected items, offer reasoning…">${esc(admin.internalNotes || "")}</textarea>
      </div>
      <button type="submit" class="btn big">Save deal update</button>
      <p id="saveStatus" class="form-status" role="status"></p>
    </form>
  `;

  document.getElementById("calculateOffer").addEventListener("click", calculateOffer);
  document.getElementById("dealForm").addEventListener("submit", saveDeal);
}

async function saveDeal(event) {
  event.preventDefault();
  const status = document.getElementById("saveStatus");
  const button = event.currentTarget.querySelector("button[type=submit]");
  status.textContent = "Saving…";
  button.disabled = true;
  try {
    await api("PATCH", {
      issueNumber: state.selectedIssue,
      admin: {
        status: document.getElementById("v-status").value,
        priority: document.getElementById("v-priority").value,
        estimatedResaleGbp: Number(document.getElementById("v-resale").value || 0) || null,
        recommendedOfferGbp: Number(document.getElementById("v-offer").value || 0) || null,
        revenueSharePercent: Number(document.getElementById("v-share").value || 0) || null,
        nextFollowUp: document.getElementById("v-follow").value,
        internalNotes: document.getElementById("v-notes").value,
      },
    });
    status.style.color = "var(--blue-bright)";
    status.textContent = "Deal record saved.";
    await loadDesk();
  } catch (error) {
    status.style.color = "#ff9c9c";
    status.textContent = error.message;
  } finally {
    button.disabled = false;
  }
}

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  state.key = document.getElementById("deskKey").value;
  loginStatus.textContent = "Opening deal desk…";
  try {
    await loadDesk();
    sessionStorage.setItem("aoDealDeskKey", state.key);
    loginStatus.textContent = "";
  } catch (error) {
    state.key = "";
    loginStatus.style.color = "#ff9c9c";
    loginStatus.textContent = error.message;
  }
});

document.getElementById("refreshDesk").addEventListener("click", loadDesk);
lockButton.addEventListener("click", lockDesk);
[searchEl, statusFilter, routeFilter].forEach((input) =>
  input.addEventListener(input === searchEl ? "input" : "change", renderList)
);

if (state.key) {
  loadDesk().catch(() => lockDesk());
}

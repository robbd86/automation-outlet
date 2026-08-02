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

const offerModeNames = {
  "three-options": "Three options",
  cash: "Cash purchase",
  selective: "Selective purchase",
  managed: "Managed resale",
  decline: "Polite decline",
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
  return Number.isFinite(number) && number >= 0
    ? new Intl.NumberFormat("en-GB", {
        style: "currency",
        currency: "GBP",
        maximumFractionDigits: 2,
      }).format(number)
    : "—";
}

function moneyNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0
    ? Math.round(number * 100) / 100
    : 0;
}

function numberValue(id, fallback = 0) {
  const element = document.getElementById(id);
  if (!element) return fallback;
  const number = Number(element.value);
  return Number.isFinite(number) ? number : fallback;
}

function dateLabel(value) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat("en-GB", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      }).format(date);
}

function dateTimeLabel(value) {
  if (!value) return "Not generated yet";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat("en-GB", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      }).format(date);
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
        item.manufacturer,
        item.partNumber,
        item.equipmentType,
        item.condition,
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
    (sum, entry) => sum + (Number(entry.admin?.recommendedOfferGbp) || 0),
    0
  );
  const resaleValue = state.enquiries.reduce(
    (sum, entry) => sum + (Number(entry.admin?.estimatedResaleGbp) || 0),
    0
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
    .filter(Boolean)
    .join(" ");
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

function itemLabel(item) {
  const main = [item.manufacturer, item.partNumber || item.equipmentType]
    .filter(Boolean)
    .join(" ");
  return `${item.quantity || 1} × ${main || "equipment item"}`;
}

function normalisedValuations(entry) {
  const existing = Array.isArray(entry.admin?.itemValuations)
    ? entry.admin.itemValuations
    : [];
  return (entry.items || []).map((item, index) => {
    const current = existing[index] || {};
    return {
      selected: current.selected !== false,
      estimatedResaleGbp: moneyNumber(current.estimatedResaleGbp),
      shippingGbp: moneyNumber(current.shippingGbp),
      testingGbp: moneyNumber(current.testingGbp),
      targetProfitGbp: moneyNumber(current.targetProfitGbp),
    };
  });
}

function valuationCash(valuation, feePercent) {
  const resale = moneyNumber(valuation.estimatedResaleGbp);
  const fees = resale * Math.max(0, feePercent) / 100;
  const shipping = moneyNumber(valuation.shippingGbp);
  const testing = moneyNumber(valuation.testingGbp);
  const profit = moneyNumber(valuation.targetProfitGbp);
  return Math.max(0, resale - fees - shipping - testing - profit);
}

function valuationNet(valuation, feePercent) {
  const resale = moneyNumber(valuation.estimatedResaleGbp);
  const fees = resale * Math.max(0, feePercent) / 100;
  return Math.max(
    0,
    resale - fees - moneyNumber(valuation.shippingGbp) - moneyNumber(valuation.testingGbp)
  );
}

function valuationRows(entry) {
  const valuations = normalisedValuations(entry);
  return `
    <div class="valuation-table">
      <div class="valuation-row valuation-head" aria-hidden="true">
        <span>Buy</span><span>Equipment</span><span>Est. resale</span><span>Shipping</span><span>Test / returns</span><span>Profit</span><span>Max cash</span>
      </div>
      ${(entry.items || []).map((item, index) => {
        const value = valuations[index];
        return `
          <div class="valuation-row" data-index="${index}">
            <label class="valuation-check" title="Include in the cash or selective purchase offer">
              <input class="v-item-selected" type="checkbox" ${value.selected ? "checked" : ""}>
              <span class="sr-only">Include ${esc(itemLabel(item))}</span>
            </label>
            <div class="valuation-item">
              <strong>${esc(itemLabel(item))}</strong>
              <small>${esc(item.condition || "Condition not stated")}</small>
            </div>
            <div class="money-field compact"><span>£</span><input class="v-item-resale" type="number" min="0" step="1" value="${value.estimatedResaleGbp || ""}" aria-label="Estimated resale for ${esc(itemLabel(item))}"></div>
            <div class="money-field compact"><span>£</span><input class="v-item-shipping" type="number" min="0" step="1" value="${value.shippingGbp || ""}" aria-label="Shipping for ${esc(itemLabel(item))}"></div>
            <div class="money-field compact"><span>£</span><input class="v-item-testing" type="number" min="0" step="1" value="${value.testingGbp || ""}" aria-label="Testing and returns allowance for ${esc(itemLabel(item))}"></div>
            <div class="money-field compact"><span>£</span><input class="v-item-profit" type="number" min="0" step="1" value="${value.targetProfitGbp || ""}" aria-label="Target profit for ${esc(itemLabel(item))}"></div>
            <strong class="v-item-cash">${gbp(valuationCash(value, entry.admin?.feesPercent ?? 15.42))}</strong>
          </div>
        `;
      }).join("")}
    </div>
  `;
}

function readValuations() {
  return Array.from(panelEl.querySelectorAll(".valuation-row[data-index]")).map((row) => ({
    selected: row.querySelector(".v-item-selected").checked,
    estimatedResaleGbp: moneyNumber(row.querySelector(".v-item-resale").value),
    shippingGbp: moneyNumber(row.querySelector(".v-item-shipping").value),
    testingGbp: moneyNumber(row.querySelector(".v-item-testing").value),
    targetProfitGbp: moneyNumber(row.querySelector(".v-item-profit").value),
  }));
}

function valuationTotals(valuations, feePercent) {
  const selected = valuations.filter((value) => value.selected);
  const valued = valuations.filter((value) => value.estimatedResaleGbp > 0);
  return {
    selectedCount: selected.length,
    selectedResale: selected.reduce((sum, value) => sum + value.estimatedResaleGbp, 0),
    selectedCash: selected.reduce((sum, value) => sum + valuationCash(value, feePercent), 0),
    selectedProfit: selected.reduce((sum, value) => sum + value.targetProfitGbp, 0),
    totalResale: valued.reduce((sum, value) => sum + value.estimatedResaleGbp, 0),
    managedNet: valued.reduce((sum, value) => sum + valuationNet(value, feePercent), 0),
  };
}

function updateValuationSummary({ overwriteOffers = true } = {}) {
  const feePercent = Math.max(0, numberValue("v-fees", 15.42));
  const valuations = readValuations();
  const totals = valuationTotals(valuations, feePercent);

  panelEl.querySelectorAll(".valuation-row[data-index]").forEach((row, index) => {
    row.querySelector(".v-item-cash").textContent = gbp(valuationCash(valuations[index], feePercent));
    row.classList.toggle("excluded", !valuations[index].selected);
  });

  const result = document.getElementById("valuationResult");
  if (result) {
    result.innerHTML = `
      <span>Selected lines <b>${totals.selectedCount}/${valuations.length}</b></span>
      <span>Selected resale <b>${gbp(totals.selectedResale)}</b></span>
      <span>Maximum cash <b>${gbp(totals.selectedCash)}</b></span>
      <span>Target gross profit <b>${gbp(totals.selectedProfit)}</b></span>
    `;
  }

  const resaleInput = document.getElementById("v-resale");
  if (resaleInput) resaleInput.value = totals.totalResale ? totals.totalResale.toFixed(2) : "";

  if (overwriteOffers) {
    const offerInput = document.getElementById("v-offer");
    if (offerInput) offerInput.value = totals.selectedCash ? totals.selectedCash.toFixed(2) : "";
    updateManagedEstimate(totals.managedNet);
  }
  return { valuations, totals, feePercent };
}

function updateManagedEstimate(managedNet) {
  const share = Math.min(100, Math.max(0, numberValue("v-share", 70))) / 100;
  const lowInput = document.getElementById("v-managed-low");
  const highInput = document.getElementById("v-managed-high");
  if (!lowInput || !highInput) return;
  const high = Math.max(0, managedNet * share);
  const low = high * 0.8;
  lowInput.value = low ? low.toFixed(2) : "";
  highInput.value = high ? high.toFixed(2) : "";
}

function selectedItemLines(entry, valuations) {
  return valuations
    .map((value, index) => ({ value, item: entry.items?.[index] }))
    .filter(({ value, item }) => value.selected && item)
    .map(({ item }) => `• ${itemLabel(item)}`);
}

function offerSubject(entry, mode) {
  const company = entry.contact?.company || entry.contact?.name || "your equipment";
  return mode === "decline"
    ? `Automation Outlet assessment – ${company}`
    : `Automation Outlet offer options – ${company}`;
}

function offerMessages(entry, mode) {
  const firstName = String(entry.contact?.name || "there").trim().split(/\s+/)[0] || "there";
  const valuations = readValuations();
  const selectedLines = selectedItemLines(entry, valuations);
  const selectedText = selectedLines.length
    ? selectedLines.join("\n")
    : "• No equipment lines are currently selected";
  const cash = moneyNumber(numberValue("v-offer"));
  const managedLow = moneyNumber(numberValue("v-managed-low"));
  const managedHigh = moneyNumber(numberValue("v-managed-high"));
  const selectedCount = valuations.filter((value) => value.selected).length;
  const allSelected = selectedCount === valuations.length && valuations.length > 0;
  const selectedParagraph = allSelected
    ? "This would cover the full submitted list, subject to the equipment matching the photographs and stated condition."
    : `This would cover the following selected equipment:\n${selectedText}`;
  const reference = entry.reference || "your enquiry";

  let email = "";
  let whatsapp = "";

  if (mode === "cash") {
    email = `Hi ${firstName},\n\nThanks for sending the equipment details over. I have reviewed enquiry ${reference}.\n\nWe can offer ${gbp(cash)} for an immediate outright purchase. ${selectedParagraph}\n\nThe offer includes collection where agreed and transfers the testing, storage, selling, warranty and return risk to Automation Outlet. It is therefore a trade purchase price rather than an end-user retail valuation.\n\nThe offer remains subject to final photographs, quantities and condition being as described.\n\nKind regards,\nRob\nAutomation Outlet`;
    whatsapp = `Hi ${firstName}, thanks for sending the equipment over. I can offer ${gbp(cash)} for an immediate purchase. ${allSelected ? "That covers the full submitted list" : `That covers ${selectedCount} selected line${selectedCount === 1 ? "" : "s"}`}, subject to photos, quantities and condition matching the details supplied. The offer includes us taking on the testing, storage, resale and return risk.`;
  } else if (mode === "selective") {
    email = `Hi ${firstName},\n\nThanks for sending the equipment details over. Rather than heavily discounting the complete lot, the strongest route from our side would be a selective purchase.\n\nWe can offer ${gbp(cash)} for:\n${selectedText}\n\nYou would retain the remaining equipment. This keeps the cash offer focused on the items we can realistically stock and resell, rather than reducing the entire proposal to account for slower-moving parts.\n\nThe offer remains subject to final photographs, quantities and condition being as described.\n\nKind regards,\nRob\nAutomation Outlet`;
    whatsapp = `Hi ${firstName}, I have reviewed the list. The strongest option from my side is a selective purchase at ${gbp(cash)} for:\n${selectedText}\n\nYou would keep the remaining items. This avoids me having to heavily discount the whole lot because of the slower-moving stock.`;
  } else if (mode === "managed") {
    email = `Hi ${firstName},\n\nThanks for sending the equipment details over. If your priority is the highest possible return rather than an immediate cash exit, managed resale may be the better route.\n\nBased on the information currently supplied, the estimated seller return is approximately ${gbp(managedLow)} to ${gbp(managedHigh)} as items sell. Automation Outlet would handle testing, photography, listings, buyer enquiries, fulfilment and returns.\n\nThis is an estimate rather than a guaranteed sale value. The final return depends on test results, condition, achieved selling prices and how long the equipment takes to sell.\n\nKind regards,\nRob\nAutomation Outlet`;
    whatsapp = `Hi ${firstName}, if your priority is the highest return rather than immediate cash, managed resale looks like the better route. The current estimated return to you is around ${gbp(managedLow)}–${gbp(managedHigh)} as items sell. I would handle testing, listings, buyers, shipping and returns. It is an estimate and depends on condition and achieved sale prices.`;
  } else if (mode === "decline") {
    email = `Hi ${firstName},\n\nThanks for sending the equipment details over and giving Automation Outlet the opportunity to assess it.\n\nI have reviewed the list, but unfortunately I cannot make a sensible purchase offer at this stage. The likely resale timescale and current demand would mean either offering a figure that is unlikely to work for you or tying up too much capital for the expected return.\n\nI would rather be straightforward than make an offer that does not reflect your expectations. Please feel free to come back to me if the situation changes or if you would like to discuss a selective or managed-resale route.\n\nKind regards,\nRob\nAutomation Outlet`;
    whatsapp = `Hi ${firstName}, thanks for sending everything over. I have reviewed it, but I cannot make a sensible outright purchase offer at the moment. The likely resale time and current demand would mean either offering too little or tying up too much capital. I would rather be straight with you. If things change, I would still be happy to look at a selective or managed-resale route.`;
  } else {
    const selectiveOption = allSelected
      ? `2. Selective purchase\nIf you would prefer to keep part of the stock, I can refine the proposal once we identify which lines you want included.`
      : `2. Selective purchase – ${gbp(cash)}\nThis covers:\n${selectedText}\nYou would retain the remaining equipment.`;
    email = `Hi ${firstName},\n\nThanks for sending the equipment details over. I have reviewed enquiry ${reference}. There are three possible routes depending on whether your priority is speed, simplicity or the highest potential return.\n\n1. Immediate cash purchase – ${gbp(cash)}\n${selectedParagraph}\nThe price includes us taking on the testing, storage, selling, warranty and return risk.\n\n${selectiveOption}\n\n3. Managed resale – estimated seller return ${gbp(managedLow)} to ${gbp(managedHigh)}\nAutomation Outlet would test, photograph, advertise and fulfil the equipment, with payment made as items sell. This estimate depends on condition, test results, achieved prices and resale timescale.\n\nLet me know which route is closest to what you had in mind and I can firm up the next step.\n\nKind regards,\nRob\nAutomation Outlet`;
    whatsapp = `Hi ${firstName}, I have reviewed the equipment. The main options are:\n\n1) Cash purchase: ${gbp(cash)} for ${allSelected ? "the submitted list" : `${selectedCount} selected line${selectedCount === 1 ? "" : "s"}`}\n2) Selective purchase: focus only on the strongest items and you retain the rest\n3) Managed resale: estimated return around ${gbp(managedLow)}–${gbp(managedHigh)} as items sell\n\nThe cash figure is a trade offer because I take on testing, storage, selling and return risk. Let me know which route is closest to what you had in mind.`;
  }

  return {
    subject: offerSubject(entry, mode),
    email,
    whatsapp,
  };
}

function generateOffer(mode) {
  const entry = state.enquiries.find((row) => row.issueNumber === state.selectedIssue);
  if (!entry) return;
  const { valuations } = updateValuationSummary({ overwriteOffers: false });
  const selectedCount = valuations.filter((value) => value.selected).length;
  const cash = moneyNumber(numberValue("v-offer"));
  const managedHigh = moneyNumber(numberValue("v-managed-high"));
  const status = document.getElementById("copyStatus");
  if (["three-options", "cash", "selective"].includes(mode) && (!selectedCount || cash <= 0)) {
    status.style.color = "#ff9c9c";
    status.textContent = "Select at least one item and enter enough valuation detail to produce a cash offer.";
    return;
  }
  if (["three-options", "managed"].includes(mode) && managedHigh <= 0) {
    status.style.color = "#ff9c9c";
    status.textContent = "Enter resale values and a seller share before generating a managed-resale estimate.";
    return;
  }
  const messages = offerMessages(entry, mode);
  document.getElementById("offer-mode").value = mode;
  document.getElementById("offer-subject").value = messages.subject;
  document.getElementById("offer-email").value = messages.email;
  document.getElementById("offer-whatsapp").value = messages.whatsapp;
  const generatedAt = new Date().toISOString();
  document.getElementById("offer-generated-at").value = generatedAt;
  document.getElementById("offerGeneratedLabel").textContent = `Generated ${dateTimeLabel(generatedAt)} · ${offerModeNames[mode] || "Offer"}`;
  status.style.color = "var(--blue-bright)";
  status.textContent = "Seller response generated. Save the deal update to keep an exact copy.";
}

async function copyText(text) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const helper = document.createElement("textarea");
  helper.value = text;
  helper.style.position = "fixed";
  helper.style.opacity = "0";
  document.body.appendChild(helper);
  helper.select();
  document.execCommand("copy");
  helper.remove();
}

async function copyOffer(kind) {
  const status = document.getElementById("copyStatus");
  try {
    const text = kind === "email"
      ? `Subject: ${document.getElementById("offer-subject").value}\n\n${document.getElementById("offer-email").value}`
      : document.getElementById("offer-whatsapp").value;
    if (!text.trim()) throw new Error("Generate a response first");
    await copyText(text);
    status.style.color = "var(--blue-bright)";
    status.textContent = kind === "email" ? "Email copied." : "WhatsApp response copied.";
  } catch (error) {
    status.style.color = "#ff9c9c";
    status.textContent = error.message || "Could not copy the response.";
  }
}

function selectEnquiry(issueNumber) {
  state.selectedIssue = issueNumber;
  const entry = state.enquiries.find((row) => row.issueNumber === issueNumber);
  if (!entry) return;
  renderList();

  const admin = entry.admin || {};
  const offer = admin.offerDraft || {};
  const feesPercent = Number.isFinite(Number(admin.feesPercent)) ? Number(admin.feesPercent) : 15.42;
  const managedLow = moneyNumber(admin.managedLowGbp);
  const managedHigh = moneyNumber(admin.managedHighGbp);

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
      <h3>Seller notes</h3>
      <p class="seller-notes">${esc(entry.notes || "No seller notes supplied.")}</p>
    </div>

    <form id="dealForm" class="panel-section deal-form">
      <div class="section-heading-row">
        <div>
          <h3>Deal decision</h3>
          <p>Value each line, select what you want to buy and build a seller-ready response.</p>
        </div>
      </div>

      <div class="panel-grid decision-grid">
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
          <label for="v-follow">Next follow-up</label>
          <input id="v-follow" type="date" value="${esc(admin.nextFollowUp || "")}">
        </div>
        <div class="field">
          <label for="v-fees">Selling fees %</label>
          <input id="v-fees" type="number" min="0" max="100" step=".01" value="${feesPercent}">
        </div>
      </div>

      <div class="valuation-box offer-valuation-box">
        <div class="section-heading-row">
          <div>
            <h3>Item-level valuation</h3>
            <p>Enter total expected resale and allowances for each submitted line. Untick slower-moving items to create a selective purchase.</p>
          </div>
          <button type="button" id="calculateOffer" class="btn ghost desk-small-btn">Recalculate</button>
        </div>
        ${valuationRows(entry)}
        <div id="valuationResult" class="valuation-result"></div>
      </div>

      <div class="valuation-box offer-builder">
        <div class="section-heading-row">
          <div>
            <h3>Seller offer builder</h3>
            <p>Figures remain editable after calculation. Managed resale is estimated from net proceeds after entered fees and allowances.</p>
          </div>
          <span id="offerGeneratedLabel" class="offer-generated">${esc(offer.generatedAt ? `Generated ${dateTimeLabel(offer.generatedAt)} · ${offerModeNames[offer.mode] || "Offer"}` : "Not generated yet")}</span>
        </div>

        <div class="panel-grid offer-figures">
          <div class="field">
            <label for="v-resale">Total estimated resale</label>
            <div class="money-field"><span>£</span><input id="v-resale" type="number" min="0" step="1" value="${admin.estimatedResaleGbp || ""}" readonly></div>
          </div>
          <div class="field">
            <label for="v-offer">Cash / selective offer</label>
            <div class="money-field"><span>£</span><input id="v-offer" type="number" min="0" step="1" value="${admin.recommendedOfferGbp || ""}"></div>
          </div>
          <div class="field">
            <label for="v-share">Seller share of net proceeds %</label>
            <input id="v-share" type="number" min="0" max="100" step="1" value="${admin.revenueSharePercent || 70}">
          </div>
          <div class="field">
            <label for="v-managed-low">Managed resale estimate – low</label>
            <div class="money-field"><span>£</span><input id="v-managed-low" type="number" min="0" step="1" value="${managedLow || ""}"></div>
          </div>
          <div class="field">
            <label for="v-managed-high">Managed resale estimate – high</label>
            <div class="money-field"><span>£</span><input id="v-managed-high" type="number" min="0" step="1" value="${managedHigh || ""}"></div>
          </div>
        </div>

        <div class="offer-actions" aria-label="Generate seller response">
          <button type="button" class="btn offer-mode-btn" data-offer-mode="three-options">Three options</button>
          <button type="button" class="btn ghost offer-mode-btn" data-offer-mode="cash">Cash only</button>
          <button type="button" class="btn ghost offer-mode-btn" data-offer-mode="selective">Selective</button>
          <button type="button" class="btn ghost offer-mode-btn" data-offer-mode="managed">Managed resale</button>
          <button type="button" class="btn ghost offer-mode-btn" data-offer-mode="decline">Polite decline</button>
        </div>

        <input id="offer-mode" type="hidden" value="${esc(offer.mode || "")}">
        <input id="offer-generated-at" type="hidden" value="${esc(offer.generatedAt || "")}">
        <div class="field">
          <label for="offer-subject">Email subject</label>
          <input id="offer-subject" type="text" maxlength="200" value="${esc(offer.subject || "")}">
        </div>
        <div class="offer-copy-grid">
          <div class="field">
            <label for="offer-email">Email response</label>
            <textarea id="offer-email" maxlength="5000" placeholder="Generate a response, then edit it here before copying or saving.">${esc(offer.emailText || "")}</textarea>
          </div>
          <div class="field">
            <label for="offer-whatsapp">WhatsApp response</label>
            <textarea id="offer-whatsapp" maxlength="2500" placeholder="A shorter WhatsApp version will appear here.">${esc(offer.whatsappText || "")}</textarea>
          </div>
        </div>
        <div class="offer-actions copy-actions">
          <button type="button" id="copyEmail" class="btn ghost">Copy email</button>
          <button type="button" id="copyWhatsApp" class="btn ghost">Copy WhatsApp</button>
          <span id="copyStatus" class="form-status" role="status"></span>
        </div>
      </div>

      <div class="field">
        <label for="v-notes">Internal notes</label>
        <textarea id="v-notes" placeholder="Research, seller expectations, selected items, offer reasoning…">${esc(admin.internalNotes || "")}</textarea>
      </div>
      <button type="submit" class="btn big">Save deal and exact offer</button>
      <p id="saveStatus" class="form-status" role="status"></p>
    </form>
  `;

  panelEl.querySelectorAll(".valuation-row[data-index] input").forEach((input) => {
    input.addEventListener("input", () => updateValuationSummary());
    input.addEventListener("change", () => updateValuationSummary());
  });
  document.getElementById("v-fees").addEventListener("input", () => updateValuationSummary());
  document.getElementById("v-share").addEventListener("input", () => {
    const { totals } = updateValuationSummary({ overwriteOffers: false });
    updateManagedEstimate(totals.managedNet);
  });
  document.getElementById("calculateOffer").addEventListener("click", () => updateValuationSummary());
  panelEl.querySelectorAll(".offer-mode-btn").forEach((button) => {
    button.addEventListener("click", () => generateOffer(button.dataset.offerMode));
  });
  document.getElementById("copyEmail").addEventListener("click", () => copyOffer("email"));
  document.getElementById("copyWhatsApp").addEventListener("click", () => copyOffer("whatsapp"));
  document.getElementById("dealForm").addEventListener("submit", saveDeal);
  updateValuationSummary({
    overwriteOffers: !(admin.recommendedOfferGbp || admin.managedLowGbp || admin.managedHighGbp),
  });
}

async function saveDeal(event) {
  event.preventDefault();
  const status = document.getElementById("saveStatus");
  const button = event.currentTarget.querySelector("button[type=submit]");
  status.textContent = "Saving…";
  button.disabled = true;
  try {
    const { valuations, totals, feePercent } = updateValuationSummary({ overwriteOffers: false });
    const generatedAt = document.getElementById("offer-generated-at").value;
    await api("PATCH", {
      issueNumber: state.selectedIssue,
      admin: {
        status: document.getElementById("v-status").value,
        priority: document.getElementById("v-priority").value,
        feesPercent: feePercent,
        itemValuations: valuations,
        estimatedResaleGbp: totals.totalResale || null,
        recommendedOfferGbp: Number(document.getElementById("v-offer").value || 0) || null,
        revenueSharePercent: Number(document.getElementById("v-share").value || 0) || null,
        managedLowGbp: Number(document.getElementById("v-managed-low").value || 0) || null,
        managedHighGbp: Number(document.getElementById("v-managed-high").value || 0) || null,
        nextFollowUp: document.getElementById("v-follow").value,
        internalNotes: document.getElementById("v-notes").value,
        offerDraft: {
          mode: document.getElementById("offer-mode").value,
          subject: document.getElementById("offer-subject").value,
          emailText: document.getElementById("offer-email").value,
          whatsappText: document.getElementById("offer-whatsapp").value,
          generatedAt,
        },
      },
    });
    const successMessage = generatedAt
      ? "Deal record and exact seller response saved."
      : "Deal record saved.";
    await loadDesk();
    const refreshedStatus = document.getElementById("saveStatus");
    if (refreshedStatus) {
      refreshedStatus.style.color = "var(--blue-bright)";
      refreshedStatus.textContent = successMessage;
    }
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

(() => {
  const API = "/api/stock";
  const KEY_STORE = "aoStockManagerKey";
  const panel = document.getElementById("managerPanel");
  if (!panel || document.getElementById("ebayImportPanel")) return;

  const style = document.createElement("style");
  style.textContent = `
    .ebay-import{margin:0 0 1.2rem;background:var(--navy-card);border:1px solid var(--line);border-radius:var(--radius);padding:1.2rem}
    .ebay-import-head{display:flex;justify-content:space-between;gap:1rem;align-items:flex-start;flex-wrap:wrap}
    .ebay-import-head h2{font-size:1.8rem;margin:0}
    .ebay-import-controls{display:flex;gap:.65rem;align-items:center;flex-wrap:wrap}
    .ebay-file{max-width:340px}
    .ebay-import-summary{color:var(--grey);font-size:.88rem;margin-top:.5rem}
    .ebay-import-status{font-weight:600;color:var(--blue-bright);min-height:1.35em;margin-top:.75rem}
    .ebay-preview{display:grid;gap:.65rem;margin-top:1rem}
    .ebay-row{display:grid;grid-template-columns:auto minmax(160px,1.4fr) minmax(120px,.9fr) minmax(110px,.75fr) minmax(120px,.85fr) 95px 80px;gap:.55rem;align-items:center;border:1px solid var(--line);border-radius:10px;padding:.7rem;background:var(--navy-deep)}
    .ebay-row.head{background:transparent;border:0;padding:.15rem .7rem;color:var(--grey);font-size:.72rem;text-transform:uppercase;letter-spacing:.06em}
    .ebay-row input,.ebay-row select{min-width:0;padding:.5rem .55rem;font-size:.82rem}
    .ebay-row input[type="checkbox"]{width:auto}
    .ebay-title{font-size:.87rem;font-weight:600;line-height:1.25}
    .ebay-sub{font:500 .72rem 'IBM Plex Mono';color:var(--blue-bright);margin-top:.2rem}
    .ebay-dup{color:#ffcf7d;font-size:.7rem;margin-top:.15rem}
    .ebay-actions{display:flex;gap:.6rem;align-items:center;flex-wrap:wrap;margin-top:1rem}
    .ebay-actions .btn{font-size:.9rem;padding:.65rem 1rem}
    .ebay-select-label{display:flex;gap:.45rem;align-items:center;color:var(--grey);font-size:.84rem}
    .ebay-select-label input{width:auto}
    @media(max-width:1000px){
      .ebay-preview{overflow-x:auto}
      .ebay-row{min-width:900px}
    }
  `;
  document.head.appendChild(style);

  const box = document.createElement("section");
  box.id = "ebayImportPanel";
  box.className = "ebay-import";
  box.innerHTML = `
    <div class="ebay-import-head">
      <div>
        <div class="eyebrow">Bulk stock import</div>
        <h2>Import active eBay listings</h2>
        <p class="ebay-import-summary">Upload an eBay Seller Hub active-listings CSV. Review the detected details, untick anything you do not want on the website, then import the selected rows.</p>
      </div>
      <div class="ebay-import-controls">
        <input id="ebayCsvFile" class="ebay-file" type="file" accept=".csv,text/csv,.txt,text/plain">
        <button id="clearEbayImport" class="mini-btn" type="button">Clear</button>
      </div>
    </div>
    <div id="ebayImportStatus" class="ebay-import-status"></div>
    <div id="ebayImportPreview" class="ebay-preview"></div>
    <div id="ebayImportActions" class="ebay-actions hidden">
      <label class="ebay-select-label"><input id="selectAllEbay" type="checkbox" checked> Select all new items</label>
      <button id="importSelectedEbay" class="btn" type="button">Import selected</button>
    </div>
  `;

  const adminHead = panel.querySelector(".admin-head");
  adminHead.insertAdjacentElement("afterend", box);

  const fileInput = document.getElementById("ebayCsvFile");
  const preview = document.getElementById("ebayImportPreview");
  const status = document.getElementById("ebayImportStatus");
  const actions = document.getElementById("ebayImportActions");
  const selectAll = document.getElementById("selectAllEbay");
  const importButton = document.getElementById("importSelectedEbay");
  const clearButton = document.getElementById("clearEbayImport");

  let rows = [];

  function setImportStatus(message, error = false) {
    status.textContent = message;
    status.style.color = error ? "#ff9d9d" : "var(--blue-bright)";
  }

  function normaliseHeader(value) {
    return String(value || "")
      .replace(/^\uFEFF/, "")
      .trim()
      .toLowerCase()
      .replace(/[()]/g, "")
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
  }

  function detectDelimiter(text) {
    const first = text.split(/\r?\n/, 1)[0] || "";
    const options = [",", "\t", ";"];
    let best = ",";
    let bestCount = -1;
    for (const delimiter of options) {
      let count = 0;
      let quoted = false;
      for (let i = 0; i < first.length; i += 1) {
        if (first[i] === '"') quoted = !quoted;
        else if (!quoted && first[i] === delimiter) count += 1;
      }
      if (count > bestCount) {
        best = delimiter;
        bestCount = count;
      }
    }
    return best;
  }

  function parseDelimited(text) {
    const delimiter = detectDelimiter(text);
    const result = [];
    let row = [];
    let field = "";
    let quoted = false;

    for (let i = 0; i < text.length; i += 1) {
      const ch = text[i];
      if (quoted) {
        if (ch === '"' && text[i + 1] === '"') {
          field += '"';
          i += 1;
        } else if (ch === '"') {
          quoted = false;
        } else {
          field += ch;
        }
      } else if (ch === '"') {
        quoted = true;
      } else if (ch === delimiter) {
        row.push(field);
        field = "";
      } else if (ch === "\n") {
        row.push(field.replace(/\r$/, ""));
        result.push(row);
        row = [];
        field = "";
      } else {
        field += ch;
      }
    }

    if (field.length || row.length) {
      row.push(field.replace(/\r$/, ""));
      result.push(row);
    }
    return result.filter((entry) => entry.some((value) => String(value).trim()));
  }

  function headerIndex(headers, aliases) {
    const normalised = headers.map(normaliseHeader);
    for (const alias of aliases) {
      const target = normaliseHeader(alias);
      const exact = normalised.indexOf(target);
      if (exact !== -1) return exact;
    }
    for (const alias of aliases) {
      const target = normaliseHeader(alias);
      const partial = normalised.findIndex((header) => header.includes(target) || target.includes(header));
      if (partial !== -1) return partial;
    }
    return -1;
  }

  function cell(row, index) {
    return index >= 0 ? String(row[index] ?? "").trim() : "";
  }

  function money(value) {
    const cleaned = String(value || "")
      .replace(/[£$,]/g, "")
      .replace(/[^\d.-]/g, "");
    const parsed = Number(cleaned);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
  }

  function quantity(value) {
    const parsed = Number.parseInt(String(value || "").replace(/[^\d-]/g, ""), 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
  }

  const knownBrands = [
    ["allen-bradley", "Allen-Bradley"],
    ["allen bradley", "Allen-Bradley"],
    ["rockwell", "Allen-Bradley"],
    ["siemens", "Siemens"],
    ["simatic", "Siemens"],
    ["omron", "Omron"],
    ["mitsubishi", "Mitsubishi"],
    ["schneider", "Schneider Electric"],
    ["telemecanique", "Schneider Electric"],
    ["abb", "ABB"],
    ["lenze", "Lenze"],
    ["pilz", "Pilz"],
    ["phoenix contact", "Phoenix Contact"],
    ["fanuc", "Fanuc"],
    ["sauter", "Sauter"],
    ["beckhoff", "Beckhoff"],
    ["b&r", "B&R"],
    ["br automation", "B&R"],
    ["yaskawa", "Yaskawa"],
    ["sew", "SEW-Eurodrive"],
    ["danfoss", "Danfoss"],
  ];

  function inferBrand(title) {
    const lower = title.toLowerCase();
    const match = knownBrands.find(([needle]) => lower.includes(needle));
    return match ? match[1] : "Other";
  }

  function inferCategory(title) {
    const lower = title.toLowerCase();
    if (/\bhmi\b|touch\s?panel|operator panel|panelview|simatic panel|ktp\d|tp\d{3}/i.test(title)) return "HMI";
    if (/inverter|variable frequency|frequency drive|\bvfd\b|\bvsd\b|\bdrive\b|micromaster|sinamics|acs\d|powerflex/i.test(title)) return "Drive / inverter";
    if (/safety|failsafe|fail-safe|guardmaster|pnoz|safety relay/i.test(title)) return "Safety module";
    if (/power supply|\bpsu\b|sitop/i.test(title)) return "Power supply";
    if (/industrial pc|\bipc\b|panel pc|box pc/i.test(title)) return "Industrial PC";
    if (/sensor|photoelectric|proximity|encoder/i.test(title)) return "Sensor";
    if (/starter|contactor|soft start|softstart/i.test(title)) return "Motor starter";
    if (/ethernet|profibus|profinet|cc-link|communication|comm module|interface module|scanner|adapter/i.test(title)) return "Communication module";
    if (/input|output|\bi\/o\b|\bio\b|digital|analogue|analog|relay output|module/i.test(title) && !/\bcpu\b|processor|controller/i.test(title)) return "PLC I/O module";
    if (/\bcpu\b|processor|controller|\bplc\b|compactlogix|micrologix|s7-?1200|s7-?1500|s7-?300|cj2m|cp2e/i.test(title)) return "PLC CPU";
    return "Other automation";
  }

  function inferCondition(raw, title) {
    const text = `${raw || ""} ${title}`.toLowerCase();
    if (/for parts|repair|spares|not working|faulty/.test(text)) return "For parts or repair";
    if (/new sealed|factory sealed|sealed box|brand new sealed/.test(text)) return "New sealed";
    if (/new without box|new no box|new other|opened box|open box|unused/.test(text)) return "New without box";
    if (/bench tested|tested working|tested & working|tested and working|pulled from working|working machinery|fully working/.test(text)) return "Used - tested working";
    if (/powers up|power up tested|power-up/.test(text)) return "Used - powers up";
    if (/\bnew\b|brand new/.test(text)) return "New without box";
    return "Used - untested";
  }

  function cleanToken(value) {
    return String(value || "")
      .replace(/^[^A-Za-z0-9]+|[^A-Za-z0-9+_.\/-]+$/g, "")
      .toUpperCase();
  }

  function inferPartNumber(title, sku, itemNumber) {
    const skuClean = cleanToken(sku);
    if (skuClean && skuClean.length >= 4 && !/^(SKU|STOCK|ITEM)[-_ ]?\d*$/i.test(skuClean)) return skuClean;

    const candidates = title
      .split(/\s+/)
      .map(cleanToken)
      .filter((token) =>
        token.length >= 5 &&
        token.length <= 40 &&
        /[A-Z]/.test(token) &&
        /\d/.test(token) &&
        !/^(PLC|HMI|CPU|VFD|VSD|NEW|USED)\d*$/i.test(token)
      );

    const scored = candidates
      .map((token) => ({
        token,
        score:
          (token.includes("-") ? 4 : 0) +
          (token.includes("/") ? 2 : 0) +
          (/\d{3,}/.test(token) ? 2 : 0) +
          (/^(6ES|6AV|6SL|6EP|3RW|3RT|17\d{2}|27\d{2}|CJ|NX|CP|Q[A-Z0-9]|FX|ACS|E82|EVS|BMX|TM)/.test(token) ? 5 : 0),
      }))
      .sort((a, b) => b.score - a.score || b.token.length - a.token.length);

    return scored[0]?.token || `EBAY-${itemNumber || "ITEM"}`;
  }

  function firstImage(value) {
    return String(value || "").split("|")[0].trim();
  }

  function listingUrl(itemNumber, explicitUrl) {
    if (/^https?:\/\//i.test(explicitUrl || "")) return explicitUrl.trim();
    const id = String(itemNumber || "").replace(/\D/g, "");
    return id ? `https://www.ebay.co.uk/itm/${id}` : "";
  }

  function buildDescription(title, condition, ebayUrl) {
    const conditionText = condition === "Used - tested working"
      ? "Used item, tested working."
      : condition === "Used - powers up"
        ? "Used item, power-up checked."
        : condition === "Used - untested"
          ? "Used item; no additional test status is stated in the imported eBay report."
          : condition === "For parts or repair"
            ? "Sold for parts or repair."
            : "Condition as stated in the listing.";
    return `${title}. ${conditionText}${ebayUrl ? " Full listing details and photographs are available via the linked eBay listing." : ""}`;
  }

  async function adminProducts() {
    const key = sessionStorage.getItem(KEY_STORE) || "";
    if (!key) throw new Error("Unlock the stock manager first.");
    const response = await fetch(`${API}?admin=1`, {
      headers: { "Accept": "application/json", "x-deal-desk-key": key },
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "Could not load current website stock.");
    return Array.isArray(data.products) ? data.products : [];
  }

  function ebayIdFromUrl(url) {
    const match = String(url || "").match(/\/itm\/(?:[^/]+\/)?(\d{8,})/i);
    return match ? match[1] : "";
  }

  function existingMatch(item, currentProducts) {
    const itemId = String(item.itemNumber || "").replace(/\D/g, "");
    return currentProducts.find((product) => {
      const existingId = ebayIdFromUrl(product.ebayUrl);
      if (itemId && existingId && itemId === existingId) return true;
      return item.partNumber && product.partNumber &&
        item.partNumber.toUpperCase() === String(product.partNumber).toUpperCase();
    });
  }

  function makeSelect(options, value, className) {
    const select = document.createElement("select");
    select.className = className;
    options.forEach((optionValue) => {
      const option = document.createElement("option");
      option.value = optionValue;
      option.textContent = optionValue;
      option.selected = optionValue === value;
      select.appendChild(option);
    });
    return select;
  }

  function makeInput(value, className, type = "text") {
    const input = document.createElement("input");
    input.type = type;
    input.className = className;
    input.value = value ?? "";
    return input;
  }

  function renderPreview() {
    preview.replaceChildren();
    if (!rows.length) {
      actions.classList.add("hidden");
      return;
    }

    const head = document.createElement("div");
    head.className = "ebay-row head";
    head.innerHTML = "<span></span><span>eBay listing</span><span>Part number</span><span>Brand</span><span>Category</span><span>Price</span><span>Qty</span>";
    preview.appendChild(head);

    const categories = [
      "PLC CPU", "PLC I/O module", "Communication module", "HMI",
      "Drive / inverter", "Safety module", "Power supply", "Industrial PC",
      "Sensor", "Motor starter", "Other automation",
    ];
    const brands = [
      "Siemens", "Omron", "Allen-Bradley", "Mitsubishi", "ABB", "Lenze",
      "Schneider Electric", "Pilz", "Phoenix Contact", "Fanuc", "Sauter",
      "Beckhoff", "B&R", "Yaskawa", "SEW-Eurodrive", "Danfoss", "Other",
    ];

    rows.forEach((item, index) => {
      const row = document.createElement("div");
      row.className = "ebay-row";

      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.className = "ebay-pick";
      checkbox.checked = !item.duplicate;
      checkbox.disabled = item.duplicate;
      checkbox.dataset.index = String(index);

      const titleWrap = document.createElement("div");
      const title = document.createElement("div");
      title.className = "ebay-title";
      title.textContent = item.title;
      const sub = document.createElement("div");
      sub.className = "ebay-sub";
      sub.textContent = item.itemNumber ? `eBay ${item.itemNumber}` : "No item number";
      titleWrap.append(title, sub);
      if (item.duplicate) {
        const dup = document.createElement("div");
        dup.className = "ebay-dup";
        dup.textContent = "Already on website — skipped";
        titleWrap.appendChild(dup);
      }

      const part = makeInput(item.partNumber, "ebay-part");
      part.dataset.index = String(index);
      const brand = makeSelect(brands, brands.includes(item.brand) ? item.brand : "Other", "ebay-brand");
      brand.dataset.index = String(index);
      const category = makeSelect(categories, item.category, "ebay-category");
      category.dataset.index = String(index);
      const price = makeInput(item.priceGbp.toFixed(2), "ebay-price", "number");
      price.min = "0";
      price.step = "0.01";
      price.dataset.index = String(index);
      const qty = makeInput(String(item.quantity), "ebay-qty", "number");
      qty.min = "1";
      qty.step = "1";
      qty.dataset.index = String(index);

      row.append(checkbox, titleWrap, part, brand, category, price, qty);
      preview.appendChild(row);
    });

    actions.classList.remove("hidden");
    const selectable = rows.filter((item) => !item.duplicate).length;
    selectAll.checked = selectable > 0;
    setImportStatus(`${rows.length} active listing${rows.length === 1 ? "" : "s"} loaded. ${selectable} ready to import.`);
  }

  function syncEdits() {
    preview.querySelectorAll("[data-index]").forEach((control) => {
      const index = Number(control.dataset.index);
      const item = rows[index];
      if (!item) return;
      if (control.classList.contains("ebay-part")) item.partNumber = control.value.trim().toUpperCase();
      if (control.classList.contains("ebay-brand")) item.brand = control.value;
      if (control.classList.contains("ebay-category")) item.category = control.value;
      if (control.classList.contains("ebay-price")) item.priceGbp = money(control.value);
      if (control.classList.contains("ebay-qty")) item.quantity = quantity(control.value);
    });
  }

  async function loadCsv(file) {
    setImportStatus("Reading eBay report…");
    const text = await file.text();
    const table = parseDelimited(text);
    if (table.length < 2) throw new Error("The file does not contain any listing rows.");

    const headers = table[0];
    const indices = {
      itemNumber: headerIndex(headers, ["Item number", "Item ID", "ItemID", "Item Number"]),
      title: headerIndex(headers, ["Title", "Item title", "Item Title"]),
      sku: headerIndex(headers, ["Custom label SKU", "Custom label", "SKU", "Custom Label"]),
      quantity: headerIndex(headers, ["Available quantity", "Available Quantity", "Quantity"]),
      price: headerIndex(headers, ["Price", "Buy It Now price", "Current price", "Start price"]),
      condition: headerIndex(headers, ["Condition", "Condition display name", "Condition Name"]),
      image: headerIndex(headers, ["Item photo URL", "Picture URL", "Image URL", "Photo URL"]),
      url: headerIndex(headers, ["eBay URL", "Listing URL", "Item URL", "View item URL"]),
      description: headerIndex(headers, ["Description", "Item description"]),
    };

    if (indices.title < 0) throw new Error(`Could not find a Title column. Found: ${headers.join(", ")}`);
    if (indices.itemNumber < 0) throw new Error(`Could not find an Item number column. Found: ${headers.join(", ")}`);

    const currentProducts = await adminProducts();
    const parsed = table.slice(1)
      .map((rawRow) => {
        const itemNumber = cell(rawRow, indices.itemNumber);
        const title = cell(rawRow, indices.title);
        if (!title || !itemNumber) return null;
        const sku = cell(rawRow, indices.sku);
        const ebayUrl = listingUrl(itemNumber, cell(rawRow, indices.url));
        const condition = inferCondition(cell(rawRow, indices.condition), title);
        const item = {
          itemNumber,
          title,
          sku,
          partNumber: inferPartNumber(title, sku, itemNumber),
          brand: inferBrand(title),
          category: inferCategory(title),
          condition,
          priceGbp: money(cell(rawRow, indices.price)),
          quantity: quantity(cell(rawRow, indices.quantity)),
          imageUrl: firstImage(cell(rawRow, indices.image)),
          ebayUrl,
          description: cell(rawRow, indices.description) || buildDescription(title, condition, ebayUrl),
          duplicate: false,
        };
        item.duplicate = Boolean(existingMatch(item, currentProducts));
        return item;
      })
      .filter(Boolean);

    if (!parsed.length) throw new Error("No usable active listings were found in the file.");
    rows = parsed;
    renderPreview();
  }

  function selectedRows() {
    syncEdits();
    const selected = [];
    preview.querySelectorAll(".ebay-pick:checked").forEach((checkbox) => {
      const item = rows[Number(checkbox.dataset.index)];
      if (item) selected.push(item);
    });
    return selected;
  }

  async function createProduct(item) {
    const key = sessionStorage.getItem(KEY_STORE) || "";
    const payload = {
      title: item.title,
      partNumber: item.partNumber || `EBAY-${item.itemNumber}`,
      brand: item.brand || "Other",
      category: item.category || "Other automation",
      condition: item.condition || "Used - untested",
      priceGbp: item.priceGbp,
      quantity: item.quantity,
      status: "active",
      sortOrder: 100,
      imageUrl: item.imageUrl || "",
      ebayUrl: item.ebayUrl || "",
      description: item.description || buildDescription(item.title, item.condition, item.ebayUrl),
      featured: false,
    };
    const response = await fetch(API, {
      method: "POST",
      headers: {
        "Accept": "application/json",
        "Content-Type": "application/json",
        "x-deal-desk-key": key,
      },
      body: JSON.stringify(payload),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || `Could not import ${item.title}`);
  }

  fileInput.addEventListener("change", async () => {
    const file = fileInput.files?.[0];
    if (!file) return;
    rows = [];
    preview.replaceChildren();
    actions.classList.add("hidden");
    try {
      await loadCsv(file);
    } catch (error) {
      setImportStatus(error.message, true);
    }
  });

  selectAll.addEventListener("change", () => {
    preview.querySelectorAll(".ebay-pick:not(:disabled)").forEach((checkbox) => {
      checkbox.checked = selectAll.checked;
    });
  });

  importButton.addEventListener("click", async () => {
    const selected = selectedRows();
    if (!selected.length) {
      setImportStatus("Select at least one new listing to import.", true);
      return;
    }

    importButton.disabled = true;
    fileInput.disabled = true;
    let imported = 0;
    const failures = [];

    for (let i = 0; i < selected.length; i += 1) {
      const item = selected[i];
      setImportStatus(`Importing ${i + 1} of ${selected.length}: ${item.partNumber}…`);
      try {
        await createProduct(item);
        imported += 1;
      } catch (error) {
        failures.push(`${item.partNumber}: ${error.message}`);
      }
    }

    importButton.disabled = false;
    fileInput.disabled = false;

    if (failures.length) {
      setImportStatus(`${imported} imported. ${failures.length} failed: ${failures.slice(0, 3).join(" | ")}`, true);
    } else {
      setImportStatus(`${imported} listing${imported === 1 ? "" : "s"} imported to the website.`);
    }

    document.getElementById("refreshBtn")?.click();
    const currentProducts = await adminProducts().catch(() => []);
    rows.forEach((item) => {
      item.duplicate = Boolean(existingMatch(item, currentProducts));
    });
    renderPreview();
  });

  clearButton.addEventListener("click", () => {
    rows = [];
    fileInput.value = "";
    preview.replaceChildren();
    actions.classList.add("hidden");
    setImportStatus("");
  });
})();

(() => {
  const API = "/api/stock";
  const KEY_STORE = "aoStockManagerKey";
  const DRAFT_STORE = "aoEbayImportDraftV1";
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
    .ebay-preview{display:grid;gap:.75rem;margin-top:1rem}
    .ebay-row{display:grid;grid-template-columns:58px minmax(0,1fr);gap:.75rem;align-items:start;border:1px solid var(--line);border-radius:12px;padding:.85rem;background:var(--navy-deep)}
    .ebay-pick-wrap{display:grid;justify-items:center;gap:.28rem;padding-top:.1rem;color:var(--grey);font-size:.68rem;text-transform:uppercase;letter-spacing:.05em;cursor:pointer}
    .ebay-pick-wrap input{width:20px!important;height:20px;min-width:20px;padding:0!important;cursor:pointer;accent-color:#2b7fff}
    .ebay-pick-wrap input:disabled{cursor:not-allowed;opacity:.45}
    .ebay-row-main{min-width:0}
    .ebay-row-top{display:flex;justify-content:space-between;align-items:flex-start;gap:.75rem;margin-bottom:.7rem;padding-bottom:.6rem;border-bottom:1px solid rgba(77,148,255,.12)}
    .ebay-title{font-size:.95rem;font-weight:700;line-height:1.25}
    .ebay-sub{font:500 .72rem 'IBM Plex Mono';color:var(--blue-bright);margin-top:.2rem}
    .ebay-dup{flex:none;color:#ffcf7d;font-size:.72rem;border:1px solid rgba(255,207,125,.35);border-radius:999px;padding:.22rem .5rem;white-space:nowrap}
    .ebay-row-body{display:grid;grid-template-columns:minmax(210px,250px) minmax(0,1fr);gap:.75rem;align-items:start}
    .ebay-image-cell{display:grid;grid-template-columns:70px minmax(0,1fr);gap:.5rem;align-items:start}
    .ebay-thumb{width:70px;height:60px;border-radius:8px;background:#fff;border:1px solid var(--line);overflow:hidden;display:grid;place-items:center;color:#66758a;font-size:.65rem;text-align:center}
    .ebay-thumb img{width:100%;height:100%;object-fit:contain;display:block}
    .ebay-image-tools{display:grid;gap:.34rem;min-width:0}
    .ebay-image-tools input[type="url"]{width:100%}
    .ebay-upload-label{display:inline-flex;align-items:center;justify-content:center;border:1px solid var(--line);border-radius:7px;padding:.42rem .55rem;cursor:pointer;font:600 .76rem 'Barlow';color:var(--white)}
    .ebay-upload-label:hover{border-color:var(--blue-bright)}
    .ebay-upload-label input{display:none}
    .ebay-upload-state{min-height:1em;font-size:.67rem;color:var(--grey);line-height:1.2}
    .ebay-fields{display:grid;grid-template-columns:minmax(130px,1.1fr) minmax(110px,.9fr) minmax(130px,1fr) 92px 70px minmax(185px,1.25fr);gap:.5rem}
    .ebay-field{min-width:0}
    .ebay-field label{display:block;margin:0 0 .25rem;color:var(--grey);font-size:.66rem;text-transform:uppercase;letter-spacing:.05em}
    .ebay-field input,.ebay-field select{width:100%;min-width:0;padding:.5rem .55rem;font-size:.8rem}
    .ebay-actions{position:sticky;bottom:0;z-index:25;display:flex;gap:.6rem;align-items:center;flex-wrap:wrap;margin-top:1rem;padding:.75rem;background:rgba(8,22,45,.98);border:1px solid var(--line);border-radius:10px;box-shadow:0 -8px 24px rgba(0,0,0,.22)}
    .ebay-actions .btn{font-size:.9rem;padding:.65rem 1rem}
    .ebay-action-progress{flex:1 1 260px;min-height:1.2em;color:var(--blue-bright);font-size:.82rem;font-weight:600}
    .ebay-select-label{display:flex;gap:.45rem;align-items:center;color:var(--grey);font-size:.84rem}
    .ebay-select-label input{width:auto}
    @media(max-width:1100px){
      .ebay-row-body{grid-template-columns:210px minmax(0,1fr)}
      .ebay-fields{grid-template-columns:repeat(3,minmax(0,1fr))}
    }
    @media(max-width:760px){
      .ebay-row{grid-template-columns:48px minmax(0,1fr);padding:.7rem;gap:.55rem}
      .ebay-row-top{display:block}
      .ebay-dup{display:inline-block;margin-top:.45rem}
      .ebay-row-body{grid-template-columns:1fr}
      .ebay-image-cell{grid-template-columns:64px minmax(0,1fr)}
      .ebay-thumb{width:64px;height:56px}
      .ebay-fields{grid-template-columns:repeat(2,minmax(0,1fr))}
    }
    @media(max-width:520px){
      .ebay-fields{grid-template-columns:1fr}
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
        <p class="ebay-import-summary">Upload an eBay Seller Hub active-listings CSV. Review the detected details, confirm or replace the image, choose checkout delivery, untick anything you do not want on the website, then import the selected rows.</p>
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
      <label class="ebay-select-label">Delivery for selected
        <select id="bulkEbayDelivery">
          <option value="parcel">UK parcel - £7.95 / free over £250</option>
          <option value="quote">Quote required - no card checkout</option>
        </select>
      </label>
      <button id="applyEbayDelivery" class="mini-btn" type="button">Apply delivery</button>
      <div id="ebayImportProgress" class="ebay-action-progress" aria-live="polite"></div>
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
  const bulkDelivery = document.getElementById("bulkEbayDelivery");
  const applyDelivery = document.getElementById("applyEbayDelivery");
  const actionProgress = document.getElementById("ebayImportProgress");

  let rows = [];
  let pendingUploads = 0;

  function setImportStatus(message, error = false) {
    status.textContent = message;
    status.style.color = error ? "#ff9d9d" : "var(--blue-bright)";
  }

  function setActionProgress(message, error = false) {
    actionProgress.textContent = message;
    actionProgress.style.color = error ? "#ff9d9d" : "var(--blue-bright)";
  }

  function saveDraft() {
    if (!rows.length) return;
    preview.querySelectorAll(".ebay-pick").forEach((checkbox) => {
      const item = rows[Number(checkbox.dataset.index)];
      if (item) item.selected = Boolean(checkbox.checked);
    });
    const safeRows = rows.map((item) => {
      const copy = { ...item };
      delete copy._index;
      return copy;
    });
    try {
      localStorage.setItem(DRAFT_STORE, JSON.stringify({ savedAt: Date.now(), rows: safeRows }));
    } catch {}
  }

  function clearDraft() {
    try { localStorage.removeItem(DRAFT_STORE); } catch {}
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
    if (/new opened box|opened box|open box/.test(text)) return "New opened box";
    if (/new without box|new no box|new other|unused/.test(text)) return "New without box";
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
          ? "Used item; no additional test status is stated."
          : condition === "For parts or repair"
            ? "Sold for parts or repair."
            : condition === "New opened box"
              ? "New and unused item with original packaging opened."
              : "Condition stated above.";
    return `${title}. ${conditionText} Supplied as described and pictured. Contact Automation Outlet if you need additional photographs or serial confirmation before ordering.`;
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

  function makeDeliverySelect(value, className) {
    const select = document.createElement("select");
    select.className = className;
    [
      ["quote", "Quote required - no card checkout"],
      ["parcel", "UK parcel - £7.95 / free over £250"],
    ].forEach(([optionValue, label]) => {
      const option = document.createElement("option");
      option.value = optionValue;
      option.textContent = label;
      option.selected = optionValue === value;
      select.appendChild(option);
    });
    return select;
  }

  function setThumb(container, url) {
    container.replaceChildren();
    if (!url) {
      container.textContent = "No image";
      return;
    }
    const image = document.createElement("img");
    image.src = url;
    image.alt = "Listing image";
    image.addEventListener("error", () => container.replaceChildren("No preview"), { once: true });
    container.appendChild(image);
  }

  function fileToJpegDataUrl(file) {
    return new Promise((resolve, reject) => {
      if (!file || !/^image\//i.test(file.type || "")) {
        reject(new Error("Choose a JPG, PNG or WebP image."));
        return;
      }
      const reader = new FileReader();
      reader.onerror = () => reject(new Error("Could not read that image."));
      reader.onload = () => {
        const image = new Image();
        image.onerror = () => reject(new Error("Could not open that image."));
        image.onload = () => {
          const maxSide = 1200;
          const scale = Math.min(1, maxSide / Math.max(image.naturalWidth || 1, image.naturalHeight || 1));
          const width = Math.max(1, Math.round((image.naturalWidth || 1) * scale));
          const height = Math.max(1, Math.round((image.naturalHeight || 1) * scale));
          const canvas = document.createElement("canvas");
          canvas.width = width;
          canvas.height = height;
          const context = canvas.getContext("2d");
          if (!context) {
            reject(new Error("Image conversion is not available in this browser."));
            return;
          }
          context.fillStyle = "#ffffff";
          context.fillRect(0, 0, width, height);
          context.drawImage(image, 0, 0, width, height);
          let quality = 0.84;
          let dataUrl = canvas.toDataURL("image/jpeg", quality);
          while (dataUrl.length > 900000 && quality > 0.54) {
            quality -= 0.08;
            dataUrl = canvas.toDataURL("image/jpeg", quality);
          }
          if (dataUrl.length > 1000000) {
            reject(new Error("Image is still too large after compression. Choose a smaller photo."));
            return;
          }
          resolve(dataUrl);
        };
        image.src = String(reader.result || "");
      };
      reader.readAsDataURL(file);
    });
  }

  async function uploadRowImage(file, item, thumb, urlInput, state, fileInputControl) {
    const key = sessionStorage.getItem(KEY_STORE) || "";
    if (!key) throw new Error("Unlock the stock manager first.");
    pendingUploads += 1;
    fileInputControl.disabled = true;
    state.textContent = "Uploading…";
    state.style.color = "var(--blue-bright)";
    try {
      const dataUrl = await fileToJpegDataUrl(file);
      const response = await fetch("/api/photo-agent", {
        method: "POST",
        headers: {
          "Accept": "application/json",
          "Content-Type": "application/json",
          "x-deal-desk-key": key,
        },
        body: JSON.stringify({
          action: "upload-hero",
          partNumber: item.partNumber || item.itemNumber || "stock-item",
          dataUrl,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.url) throw new Error(data.error || "Image upload failed.");
      item.imageUrl = data.url;
      urlInput.value = data.url;
      setThumb(thumb, data.url);
      saveDraft();
      state.textContent = "Uploaded ✓";
      state.style.color = "#8fe3b1";
    } finally {
      pendingUploads = Math.max(0, pendingUploads - 1);
      fileInputControl.disabled = false;
    }
  }

  function makeImageCell(item) {
    const wrap = document.createElement("div");
    wrap.className = "ebay-image-cell";

    const thumb = document.createElement("div");
    thumb.className = "ebay-thumb";
    setThumb(thumb, item.imageUrl);

    const tools = document.createElement("div");
    tools.className = "ebay-image-tools";
    const urlInput = makeInput(item.imageUrl || "", "ebay-image-url", "url");
    urlInput.placeholder = "eBay image URL";
    urlInput.dataset.index = String(item._index);
    urlInput.addEventListener("input", () => {
      item.imageUrl = urlInput.value.trim();
      setThumb(thumb, item.imageUrl);
    });

    const uploadLabel = document.createElement("label");
    uploadLabel.className = "ebay-upload-label";
    uploadLabel.textContent = "Upload image";
    const uploadInput = document.createElement("input");
    uploadInput.type = "file";
    uploadInput.accept = "image/jpeg,image/png,image/webp";
    uploadLabel.appendChild(uploadInput);

    const state = document.createElement("div");
    state.className = "ebay-upload-state";
    state.textContent = item.imageUrl ? "eBay/hosted image ready" : "No image selected";

    uploadInput.addEventListener("change", async () => {
      const file = uploadInput.files?.[0];
      if (!file) return;
      try {
        await uploadRowImage(file, item, thumb, urlInput, state, uploadInput);
      } catch (error) {
        state.textContent = error.message || "Image upload failed.";
        state.style.color = "#ff9d9d";
      } finally {
        uploadInput.value = "";
      }
    });

    tools.append(urlInput, uploadLabel, state);
    wrap.append(thumb, tools);
    return wrap;
  }

  function makeField(labelText, control) {
    const field = document.createElement("div");
    field.className = "ebay-field";
    const label = document.createElement("label");
    label.textContent = labelText;
    field.append(label, control);
    return field;
  }

  function renderPreview() {
    preview.replaceChildren();
    if (!rows.length) {
      actions.classList.add("hidden");
      return;
    }

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
      item._index = index;
      const row = document.createElement("div");
      row.className = "ebay-row";

      const pickWrap = document.createElement("label");
      pickWrap.className = "ebay-pick-wrap";
      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.className = "ebay-pick";
      checkbox.checked = item.duplicate ? false : item.selected !== false;
      checkbox.disabled = item.duplicate;
      checkbox.dataset.index = String(index);
      checkbox.addEventListener("change", () => {
        item.selected = checkbox.checked;
        saveDraft();
      });
      const pickText = document.createElement("span");
      pickText.textContent = item.duplicate ? "Skip" : "Include";
      pickWrap.append(checkbox, pickText);

      const main = document.createElement("div");
      main.className = "ebay-row-main";

      const top = document.createElement("div");
      top.className = "ebay-row-top";
      const titleWrap = document.createElement("div");
      const title = document.createElement("div");
      title.className = "ebay-title";
      title.textContent = item.title;
      const sub = document.createElement("div");
      sub.className = "ebay-sub";
      sub.textContent = item.itemNumber ? `eBay ${item.itemNumber}` : "No item number";
      titleWrap.append(title, sub);
      top.appendChild(titleWrap);
      if (item.duplicate) {
        const dup = document.createElement("div");
        dup.className = "ebay-dup";
        dup.textContent = "Already on website — skipped";
        top.appendChild(dup);
      }

      const imageCell = makeImageCell(item);
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
      const delivery = makeDeliverySelect(item.deliveryMode || "quote", "ebay-delivery");
      delivery.dataset.index = String(index);

      const fields = document.createElement("div");
      fields.className = "ebay-fields";
      fields.append(
        makeField("Part number", part),
        makeField("Brand", brand),
        makeField("Category", category),
        makeField("Price (£)", price),
        makeField("Qty", qty),
        makeField("Delivery / checkout", delivery)
      );

      const body = document.createElement("div");
      body.className = "ebay-row-body";
      body.append(imageCell, fields);
      main.append(top, body);
      row.append(pickWrap, main);
      preview.appendChild(row);
    });

    actions.classList.remove("hidden");
    const selectable = rows.filter((item) => !item.duplicate).length;
    const selectedCount = preview.querySelectorAll(".ebay-pick:checked:not(:disabled)").length;
    selectAll.checked = selectable > 0 && selectedCount === selectable;
    setImportStatus(`${rows.length} active listing${rows.length === 1 ? "" : "s"} loaded. ${selectedCount} selected to import.`);
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
      if (control.classList.contains("ebay-image-url")) item.imageUrl = control.value.trim();
      if (control.classList.contains("ebay-delivery")) item.deliveryMode = control.value === "parcel" ? "parcel" : "quote";
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
          deliveryMode: "quote",
          ebayUrl,
          description: cell(rawRow, indices.description) || buildDescription(title, condition, ebayUrl),
          duplicate: false,
        };
        item.duplicate = Boolean(existingMatch(item, currentProducts));
        item.selected = !item.duplicate;
        return item;
      })
      .filter(Boolean);

    if (!parsed.length) throw new Error("No usable active listings were found in the file.");
    rows = parsed;
    renderPreview();
    saveDraft();
    setActionProgress("Draft auto-saved in this browser. Your edits are protected before import.");
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
      deliveryMode: item.deliveryMode === "parcel" ? "parcel" : "quote",
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
      const item = rows[Number(checkbox.dataset.index)];
      if (item) item.selected = selectAll.checked;
    });
    saveDraft();
  });

  preview.addEventListener("input", () => {
    syncEdits();
    saveDraft();
  });
  preview.addEventListener("change", () => {
    syncEdits();
    saveDraft();
  });

  applyDelivery.addEventListener("click", () => {
    syncEdits();
    const chosen = bulkDelivery.value === "parcel" ? "parcel" : "quote";
    let changed = 0;
    preview.querySelectorAll(".ebay-pick:checked:not(:disabled)").forEach((checkbox) => {
      const index = Number(checkbox.dataset.index);
      const item = rows[index];
      if (!item) return;
      item.deliveryMode = chosen;
      const control = preview.querySelector(`.ebay-delivery[data-index="${index}"]`);
      if (control) control.value = chosen;
      changed += 1;
    });
    saveDraft();
    const message = changed ? `Delivery updated for ${changed} selected listing${changed === 1 ? "" : "s"}.` : "Select at least one listing first.";
    setImportStatus(message, !changed);
    setActionProgress(message, !changed);
  });

  importButton.addEventListener("click", async () => {
    if (pendingUploads > 0) {
      const message = "Wait for the current image upload to finish before importing.";
      setImportStatus(message, true);
      setActionProgress(message, true);
      return;
    }
    const selected = selectedRows();
    if (!selected.length) {
      const message = "Select at least one new listing to import.";
      setImportStatus(message, true);
      setActionProgress(message, true);
      return;
    }

    saveDraft();
    importButton.disabled = true;
    fileInput.disabled = true;
    importButton.textContent = `Importing 0/${selected.length}…`;
    setActionProgress(`Starting import of ${selected.length} selected listing${selected.length === 1 ? "" : "s"}…`);
    let imported = 0;
    const failures = [];

    for (let i = 0; i < selected.length; i += 1) {
      const item = selected[i];
      const progressMessage = `Importing ${i + 1} of ${selected.length}: ${item.partNumber}…`;
      importButton.textContent = `Importing ${i + 1}/${selected.length}…`;
      setImportStatus(progressMessage);
      setActionProgress(progressMessage);
      try {
        await createProduct(item);
        imported += 1;
        item.selected = false;
      } catch (error) {
        failures.push(`${item.partNumber}: ${error.message}`);
      }
    }

    importButton.disabled = false;
    fileInput.disabled = false;
    document.getElementById("refreshBtn")?.click();
    const currentProducts = await adminProducts().catch(() => []);
    rows.forEach((item) => {
      item.duplicate = Boolean(existingMatch(item, currentProducts));
      if (item.duplicate) item.selected = false;
    });
    renderPreview();

    const finalMessage = failures.length
      ? `${imported} imported successfully. ${failures.length} failed: ${failures.slice(0, 3).join(" | ")}`
      : `Import complete ✓ ${imported} listing${imported === 1 ? "" : "s"} added to Automation Outlet.`;
    setImportStatus(finalMessage, failures.length > 0);
    setActionProgress(finalMessage, failures.length > 0);
    importButton.textContent = failures.length ? "Retry remaining" : "Import complete ✓";
    if (failures.length) saveDraft(); else clearDraft();
    if (!failures.length) setTimeout(() => { importButton.textContent = "Import selected"; }, 5000);
  });

  clearButton.addEventListener("click", () => {
    rows = [];
    fileInput.value = "";
    preview.replaceChildren();
    actions.classList.add("hidden");
    setImportStatus("");
    setActionProgress("");
    clearDraft();
  });

  (async () => {
    try {
      const saved = JSON.parse(localStorage.getItem(DRAFT_STORE) || "null");
      const freshEnough = saved?.savedAt && Date.now() - Number(saved.savedAt) < 7 * 24 * 60 * 60 * 1000;
      if (!freshEnough || !Array.isArray(saved?.rows) || !saved.rows.length) {
        if (saved) clearDraft();
        return;
      }
      rows = saved.rows;
      const currentProducts = await adminProducts().catch(() => null);
      if (currentProducts) {
        rows.forEach((item) => {
          item.duplicate = Boolean(existingMatch(item, currentProducts));
          if (item.duplicate) item.selected = false;
        });
      }
      renderPreview();
      const message = "Recovered your unfinished bulk-import draft. Your previous edits are still here.";
      setImportStatus(message);
      setActionProgress(message);
    } catch {
      clearDraft();
    }
  })();
})();

const API = "/api/stock";
const keyStore = "aoStockManagerKey";
let managerKey = sessionStorage.getItem(keyStore) || "";
let products = [];

const el = (id) => document.getElementById(id);
const lockPanel = el("lockPanel");
const managerPanel = el("managerPanel");
const unlockForm = el("unlockForm");
const unlockStatus = el("unlockStatus");
const productForm = el("productForm");
const formStatus = el("formStatus");
const stockAdminList = el("stockAdminList");
const adminSearch = el("adminSearch");
const imagePreview = el("imagePreview");

const gbp = new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" });

function setStatus(element, message, error = false) {
  element.textContent = message;
  element.style.color = error ? "#ff9d9d" : "var(--blue-bright)";
}

async function api(method = "GET", body = null) {
  const url = method === "GET" ? API + "?admin=1" : API;
  const response = await fetch(url, {
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

function showManager() {
  lockPanel.classList.add("hidden");
  managerPanel.classList.remove("hidden");
}

function showLock() {
  managerPanel.classList.add("hidden");
  lockPanel.classList.remove("hidden");
  el("managerKey").value = "";
}

async function loadProducts() {
  const data = await api();
  products = Array.isArray(data.products) ? data.products : [];
  showManager();
  renderProducts();
}

function productPayload() {
  return {
    title: el("title").value,
    partNumber: el("partNumber").value,
    brand: el("brand").value,
    category: el("category").value,
    condition: el("condition").value,
    priceGbp: el("priceGbp").value,
    quantity: el("quantity").value,
    status: el("status").value,
    sortOrder: el("sortOrder").value,
    imageUrl: el("imageUrl").value,
    ebayUrl: el("ebayUrl").value,
    description: el("description").value,
    featured: el("featured").checked,
  };
}

function clearForm() {
  productForm.reset();
  el("issueNumber").value = "";
  el("quantity").value = "1";
  el("sortOrder").value = "100";
  el("status").value = "active";
  el("formHeading").textContent = "Add stock item";
  el("saveBtn").textContent = "Add item";
  el("cancelEditBtn").classList.add("hidden");
  imagePreview.replaceChildren("Image preview");
  setStatus(formStatus, "");
}

function updatePreview() {
  const url = el("imageUrl").value.trim();
  imagePreview.replaceChildren();
  if (!url) {
    imagePreview.textContent = "Image preview";
    return;
  }
  const image = document.createElement("img");
  image.src = url;
  image.alt = "Product preview";
  image.addEventListener("error", () => {
    imagePreview.replaceChildren("Image could not be loaded");
  }, { once: true });
  imagePreview.appendChild(image);
}

function editProduct(product) {
  const fields = [
    "title", "partNumber", "brand", "category", "condition",
    "priceGbp", "quantity", "status", "sortOrder",
    "imageUrl", "ebayUrl", "description",
  ];
  fields.forEach((field) => {
    el(field).value = product[field] ?? "";
  });
  el("issueNumber").value = product.issueNumber;
  el("featured").checked = Boolean(product.featured);
  el("formHeading").textContent = "Edit stock item";
  el("saveBtn").textContent = "Save changes";
  el("cancelEditBtn").classList.remove("hidden");
  updatePreview();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

async function changeStatus(product, status) {
  try {
    await api("PATCH", {
      issueNumber: product.issueNumber,
      product: { ...product, status, quantity: status === "sold" ? 0 : Math.max(1, product.quantity || 1) },
    });
    await loadProducts();
  } catch (error) {
    alert(error.message);
  }
}

function createAdminItem(product) {
  const item = document.createElement("article");
  item.className = "admin-item";

  const thumb = document.createElement("div");
  thumb.className = "admin-thumb";
  if (product.imageUrl) {
    const image = document.createElement("img");
    image.src = product.imageUrl;
    image.alt = product.partNumber;
    image.addEventListener("error", () => thumb.replaceChildren("No image"), { once: true });
    thumb.appendChild(image);
  } else {
    thumb.textContent = "No image";
  }

  const info = document.createElement("div");
  const title = document.createElement("h3");
  title.textContent = product.title;
  const pill = document.createElement("span");
  pill.className = `status-pill ${product.status}`;
  pill.textContent = product.status;
  title.appendChild(pill);

  const part = document.createElement("div");
  part.className = "admin-part";
  part.textContent = product.partNumber;

  const meta = document.createElement("div");
  meta.className = "admin-meta";
  meta.textContent = `${product.brand} · ${product.category} · ${gbp.format(Number(product.priceGbp || 0))} · Qty ${product.quantity}`;

  info.append(title, part, meta);

  const actions = document.createElement("div");
  actions.className = "admin-item-actions";
  const edit = document.createElement("button");
  edit.className = "mini-btn";
  edit.type = "button";
  edit.textContent = "Edit";
  edit.addEventListener("click", () => editProduct(product));

  const status = document.createElement("button");
  status.className = `mini-btn${product.status === "sold" ? "" : " danger"}`;
  status.type = "button";
  status.textContent = product.status === "sold" ? "Reactivate" : "Mark sold";
  status.addEventListener("click", () => changeStatus(product, product.status === "sold" ? "active" : "sold"));

  actions.append(edit, status);
  item.append(thumb, info, actions);
  return item;
}

function renderProducts() {
  const query = adminSearch.value.trim().toLowerCase();
  const visible = products.filter((product) =>
    [product.title, product.partNumber, product.brand, product.category, product.status]
      .join(" ").toLowerCase().includes(query)
  );

  stockAdminList.replaceChildren();
  el("itemCount").textContent = `${visible.length} of ${products.length} stock item${products.length === 1 ? "" : "s"}`;

  if (!visible.length) {
    const empty = document.createElement("div");
    empty.className = "admin-panel";
    empty.textContent = products.length ? "No matching stock." : "No stock has been added yet.";
    stockAdminList.appendChild(empty);
    return;
  }

  visible
    .sort((a, b) => String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")))
    .forEach((product) => stockAdminList.appendChild(createAdminItem(product)));
}

unlockForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  managerKey = el("managerKey").value;
  setStatus(unlockStatus, "Opening…");
  try {
    await loadProducts();
    sessionStorage.setItem(keyStore, managerKey);
    setStatus(unlockStatus, "");
  } catch (error) {
    setStatus(unlockStatus, error.message, true);
  }
});

productForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const issueNumber = Number(el("issueNumber").value);
  const button = el("saveBtn");
  button.disabled = true;
  setStatus(formStatus, issueNumber ? "Saving changes…" : "Adding item…");

  try {
    if (issueNumber) {
      await api("PATCH", { issueNumber, product: productPayload() });
      setStatus(formStatus, "Changes saved.");
    } else {
      await api("POST", productPayload());
      setStatus(formStatus, "Item added to the website.");
    }
    clearForm();
    await loadProducts();
  } catch (error) {
    setStatus(formStatus, error.message, true);
  } finally {
    button.disabled = false;
  }
});

el("imageUrl").addEventListener("input", updatePreview);
el("resetBtn").addEventListener("click", clearForm);
el("cancelEditBtn").addEventListener("click", clearForm);
adminSearch.addEventListener("input", renderProducts);
el("refreshBtn").addEventListener("click", () => loadProducts().catch((error) => alert(error.message)));
el("lockBtn").addEventListener("click", () => {
  sessionStorage.removeItem(keyStore);
  managerKey = "";
  showLock();
});

if (managerKey) {
  loadProducts().catch(() => {
    sessionStorage.removeItem(keyStore);
    managerKey = "";
    showLock();
  });
}

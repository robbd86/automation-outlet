(() => {
  const DELETE_API = "/api/stock-delete";
  const KEY_STORE = "aoStockManagerKey";
  const originalCreateAdminItem = window.createAdminItem;

  if (typeof originalCreateAdminItem !== "function") return;

  async function deleteProduct(product, button) {
    const name = [product.partNumber, product.title].filter(Boolean).join(" — ");
    const confirmed = window.confirm(
      `Delete ${name || "this stock item"}?\n\n` +
      "It will be removed from the website and from this stock manager. " +
      "Use Mark sold instead if you may want to reactivate it later."
    );
    if (!confirmed) return;

    const key = sessionStorage.getItem(KEY_STORE) || "";
    if (!key) {
      window.alert("Your stock-manager session has expired. Lock and reopen the manager, then try again.");
      return;
    }

    const previousText = button.textContent;
    button.disabled = true;
    button.textContent = "Deleting…";

    try {
      const response = await fetch(DELETE_API, {
        method: "DELETE",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          "x-deal-desk-key": key,
        },
        body: JSON.stringify({ issueNumber: product.issueNumber }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Delete failed");

      if (typeof window.loadProducts === "function") {
        await window.loadProducts();
      } else {
        window.location.reload();
      }
    } catch (error) {
      window.alert(error.message);
      button.disabled = false;
      button.textContent = previousText;
    }
  }

  window.createAdminItem = function createAdminItemWithDelete(product) {
    const item = originalCreateAdminItem(product);
    const actions = item.querySelector(".admin-item-actions");
    if (!actions || actions.querySelector(".delete-stock-btn")) return item;

    const button = document.createElement("button");
    button.className = "mini-btn danger delete-stock-btn";
    button.type = "button";
    button.textContent = "Delete";
    button.title = "Permanently remove this item from the stock manager";
    button.addEventListener("click", () => deleteProduct(product, button));
    actions.appendChild(button);
    return item;
  };

  if (typeof window.renderProducts === "function") {
    window.renderProducts();
  }
})();

(() => {
  const STOCK_API = "/api/stock";
  const DELETE_API = "/api/stock-delete";
  const KEY_STORE = "aoStockManagerKey";
  const originalCreateAdminItem = window.createAdminItem;

  if (typeof originalCreateAdminItem !== "function") return;

  function managerKey() {
    return sessionStorage.getItem(KEY_STORE) || "";
  }

  async function deleteIssue(issueNumber, key) {
    const response = await fetch(DELETE_API, {
      method: "DELETE",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        "x-deal-desk-key": key,
      },
      body: JSON.stringify({ issueNumber }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "Delete failed");
    return data;
  }

  async function currentProducts(key) {
    const response = await fetch(`${STOCK_API}?admin=1`, {
      headers: {
        Accept: "application/json",
        "x-deal-desk-key": key,
      },
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "Could not load current website stock.");
    return Array.isArray(data.products)
      ? data.products.filter((product) => Number(product.issueNumber) > 0 && product.status !== "deleted")
      : [];
  }

  async function refreshProducts() {
    if (typeof window.loadProducts === "function") {
      await window.loadProducts();
    } else {
      window.location.reload();
    }
  }

  async function deleteProduct(product, button) {
    const name = [product.partNumber, product.title].filter(Boolean).join(" — ");
    const confirmed = window.confirm(
      `Delete ${name || "this stock item"}?\n\n` +
      "It will be removed from the website and from this stock manager. " +
      "This does NOT delete or change the eBay listing. Use Mark sold instead if you may want to reactivate it later."
    );
    if (!confirmed) return;

    const key = managerKey();
    if (!key) {
      window.alert("Your stock-manager session has expired. Lock and reopen the manager, then try again.");
      return;
    }

    const previousText = button.textContent;
    button.disabled = true;
    button.textContent = "Deleting…";

    try {
      await deleteIssue(product.issueNumber, key);
      await refreshProducts();
    } catch (error) {
      window.alert(error.message);
      button.disabled = false;
      button.textContent = previousText;
    }
  }

  function installDeleteAllButton() {
    const actions = document.querySelector("#managerPanel .admin-actions");
    if (!actions) return;

    let button = document.getElementById("deleteAllStockBtn");
    if (!button) {
      button = document.createElement("button");
      button.id = "deleteAllStockBtn";
      button.className = "btn ghost";
      button.type = "button";
      button.textContent = "Delete all stock";
      button.style.color = "#ff9d9d";
      button.style.borderColor = "rgba(255,157,157,.55)";
      actions.insertBefore(button, actions.firstChild);
    }

    button.title = "Remove every current website stock item so a fresh CSV can be imported";
    if (button.dataset.deleteAllWired === "1") return;
    button.dataset.deleteAllWired = "1";

    button.addEventListener("click", async () => {
      const key = managerKey();
      if (!key) {
        window.alert("Your stock-manager session has expired. Lock and reopen the manager, then try again.");
        return;
      }

      const originalText = button.textContent;
      button.disabled = true;
      button.textContent = "Checking stock…";

      try {
        const products = await currentProducts(key);
        if (!products.length) {
          window.alert("There is no current website stock to delete.");
          return;
        }

        const confirmed = window.confirm(
          `Delete ALL ${products.length} website stock item${products.length === 1 ? "" : "s"}?\n\n` +
          "This clears the stock manager so you can import a fresh eBay CSV. " +
          "It does NOT delete, end or edit any listing on eBay."
        );
        if (!confirmed) return;

        const typed = window.prompt(
          `Final check: type DELETE ALL to remove ${products.length} website stock item${products.length === 1 ? "" : "s"}.`
        );
        if (typed !== "DELETE ALL") {
          window.alert("Nothing was deleted.");
          return;
        }

        let deleted = 0;
        const failures = [];

        for (let index = 0; index < products.length; index += 1) {
          const product = products[index];
          button.textContent = `Deleting ${index + 1}/${products.length}…`;
          try {
            await deleteIssue(product.issueNumber, key);
            deleted += 1;
          } catch (error) {
            failures.push(`${product.partNumber || product.issueNumber}: ${error.message}`);
          }
        }

        await refreshProducts();

        if (failures.length) {
          window.alert(
            `${deleted} item${deleted === 1 ? "" : "s"} deleted. ${failures.length} failed.\n\n` +
            failures.slice(0, 5).join("\n")
          );
        } else {
          window.alert(
            `${deleted} website stock item${deleted === 1 ? "" : "s"} deleted.\n\n` +
            "You can now upload the fresh eBay CSV and import the current listings."
          );
        }
      } catch (error) {
        window.alert(error.message);
      } finally {
        button.disabled = false;
        button.textContent = originalText;
      }
    });
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

  installDeleteAllButton();

  if (typeof window.renderProducts === "function") {
    window.renderProducts();
  }
})();

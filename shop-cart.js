(() => {
  const KEY = "aoCartV1";
  const read = () => {
    try {
      const value = JSON.parse(localStorage.getItem(KEY) || "[]");
      return Array.isArray(value) ? value : [];
    } catch {
      return [];
    }
  };
  const updateBadges = () => {
    const count = read().reduce((sum, item) => sum + Math.max(0, Number(item.quantity) || 0), 0);
    document.querySelectorAll("[data-cart-count]").forEach((el) => { el.textContent = String(count); });
  };
  const write = (items) => {
    localStorage.setItem(KEY, JSON.stringify(items));
    updateBadges();
    window.dispatchEvent(new CustomEvent("ao-cart-change", { detail: items }));
  };
  const remove = (id) => {
    const items = read().filter((item) => item.id !== id);
    write(items);
    return items;
  };
  const add = (item, quantity = 1) => {
    const items = read();
    const qty = Math.max(1, Math.min(99, Number(quantity) || 1));
    const existing = items.find((entry) => entry.id === item.id);
    if (existing) existing.quantity = Math.min(99, (Number(existing.quantity) || 0) + qty);
    else items.push({ ...item, quantity: qty });
    write(items);
    return items;
  };
  const update = (id, quantity) => {
    const items = read();
    const item = items.find((entry) => entry.id === id);
    if (!item) return items;
    const qty = Math.max(0, Math.min(99, Number(quantity) || 0));
    if (!qty) return remove(id);
    item.quantity = qty;
    write(items);
    return items;
  };
  const clear = () => write([]);
  window.AOCart = { read, write, add, update, remove, clear, updateBadges };

  document.addEventListener("DOMContentLoaded", () => {
    updateBadges();
    document.querySelectorAll("[data-add-to-cart]").forEach((button) => {
      button.addEventListener("click", () => {
        const qtyInput = document.querySelector(button.dataset.quantityTarget || "#productQty");
        const quantity = qtyInput ? qtyInput.value : 1;
        add({
          id: button.dataset.id,
          title: button.dataset.title,
          partNumber: button.dataset.part,
          brand: button.dataset.brand,
          price: Number(button.dataset.price || 0),
          deliveryMode: button.dataset.delivery || "quote",
          imageUrl: button.dataset.image || "",
          url: button.dataset.url || location.pathname,
        }, quantity);
        const original = button.textContent;
        button.textContent = "Added to basket ✓";
        button.disabled = true;
        setTimeout(() => {
          button.textContent = original;
          button.disabled = false;
        }, 1200);
      });
    });
  });
})();
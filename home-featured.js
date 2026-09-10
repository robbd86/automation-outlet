(() => {
  const section = document.getElementById("home-featured-stock");
  const grid = document.getElementById("homeFeaturedGrid");
  if (!section || !grid) return;

  const targets = [
    (p) => matchProduct(p, ["2985314", "ILC390PN2TXIB"]),
    (p) => matchProduct(p, ["ATV930D22N4"]),
    (p) => matchProduct(p, ["6ES71366DC000CA0"]),
  ];

  function compact(value) {
    return String(value || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  }

  function matchProduct(product, needles) {
    const haystack = compact([
      product.partNumber,
      product.title,
      product.brand,
      product.description,
    ].join(" "));
    return needles.some((needle) => haystack.includes(compact(needle)));
  }

  function slugify(value) {
    return String(value || "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 120);
  }

  function productUrl(product) {
    return "/stock/" + slugify([product.brand, product.partNumber].filter(Boolean).join("-"));
  }

  const gbp = new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
    maximumFractionDigits: 0,
  });

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function makeCard(product) {
    const article = el("article", "home-featured-card");

    const imageLink = el("a", "home-featured-image");
    imageLink.href = productUrl(product);
    imageLink.setAttribute("aria-label", `View ${product.title}`);

    if (product.imageUrl) {
      const img = document.createElement("img");
      img.src = product.imageUrl;
      img.alt = [product.brand, product.partNumber, product.title].filter(Boolean).join(" ");
      img.loading = "lazy";
      img.decoding = "async";
      imageLink.appendChild(img);
    } else {
      const fallback = el("div", "home-featured-fallback");
      fallback.append(
        el("strong", "", product.brand || "Automation Outlet"),
        el("span", "mono", product.partNumber || "Stock item")
      );
      imageLink.appendChild(fallback);
    }

    const star = el("span", "home-star-badge", "STAR BUY");
    imageLink.appendChild(star);

    const body = el("div", "home-featured-body");
    const meta = el(
      "div",
      "home-featured-meta",
      [product.brand, product.category].filter(Boolean).join(" · ")
    );

    const title = el("h3", "home-featured-title");
    const titleLink = el("a", "", product.title);
    titleLink.href = productUrl(product);
    title.appendChild(titleLink);

    const part = el("div", "home-featured-part", product.partNumber || "");
    const condition = el(
      "div",
      "home-featured-condition",
      [product.condition, Number(product.quantity) > 1 ? `${product.quantity} available` : "1 available"]
        .filter(Boolean)
        .join(" · ")
    );

    const bottom = el("div", "home-featured-bottom");
    const price = el("div", "home-featured-price", gbp.format(Number(product.priceGbp || 0)));
    const view = el("a", "btn", "View item");
    view.href = productUrl(product);
    bottom.append(price, view);

    const secondary = el("div", "home-featured-secondary");
    if (product.ebayUrl) {
      const ebay = el("a", "home-featured-link", "Buy on eBay");
      ebay.href = product.ebayUrl;
      ebay.target = "_blank";
      ebay.rel = "noopener nofollow sponsored";
      secondary.appendChild(ebay);
    } else {
      const enquiry = el("a", "home-featured-link", "Enquire");
      enquiry.href = "https://wa.me/447849506371?text=" + encodeURIComponent(
        `Hi, I'm interested in ${product.partNumber} — ${product.title}. Is it still available?`
      );
      enquiry.target = "_blank";
      enquiry.rel = "noopener";
      secondary.appendChild(enquiry);
    }

    body.append(meta, title, part, condition, bottom, secondary);
    article.append(imageLink, body);
    return article;
  }

  async function load() {
    try {
      const response = await fetch("/api/stock", { headers: { Accept: "application/json" } });
      if (!response.ok) throw new Error("Could not load featured stock");
      const data = await response.json();
      const products = Array.isArray(data.products) ? data.products : [];

      const chosen = targets
        .map((matcher) => products.find(matcher))
        .filter(Boolean)
        .filter((product, index, array) =>
          array.findIndex((item) => item.id === product.id) === index
        );

      if (!chosen.length) {
        section.hidden = true;
        return;
      }

      grid.replaceChildren(...chosen.map(makeCard));
      section.hidden = false;
    } catch (error) {
      section.hidden = true;
      console.error(error);
    }
  }

  load();
})();
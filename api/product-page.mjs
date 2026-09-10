import { listProducts } from "../lib/stock-read.mjs";
import { header, menuScript, browseLinks, money, publicProducts, available, productCard, shopCss } from "../lib/shop.mjs";
const SITE = "https://www.automation-outlet.co.uk";
const WA = "447849506371";

function slugify(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
}

function productSlug(product) {
  return slugify([product.brand, product.partNumber].filter(Boolean).join("-"));
}

function html(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function text(value, max = 160) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

function conditionSchema(condition) {
  const value = String(condition || "").toLowerCase();
  if (/parts|repair|faulty|damaged/.test(value)) return "https://schema.org/DamagedCondition";
  if (value.includes("refurb")) return "https://schema.org/RefurbishedCondition";
  if (value.includes("new")) return "https://schema.org/NewCondition";
  return "https://schema.org/UsedCondition";
}

function availability(product) {
  return product.status === "active" && Number(product.quantity) > 0 && product.issueState === "open";
}

function findProduct(products, requestedSlug) {
  const matches = products.filter((product) => {
    if (!["active", "sold"].includes(product.status)) return false;
    return productSlug(product) === requestedSlug || String(product.id || "") === requestedSlug;
  });

  matches.sort((a, b) => {
    const liveDifference = Number(availability(b)) - Number(availability(a));
    if (liveDifference) return liveDifference;
    return String(b.updatedAt || "").localeCompare(String(a.updatedAt || ""));
  });
  return matches[0] || null;
}

function notFound(response) {
  response.setHeader("Content-Type", "text/html; charset=utf-8");
  response.setHeader("Cache-Control", "public, s-maxage=60, stale-while-revalidate=300");
  response.setHeader("X-Robots-Tag", "noindex, follow");
  return response.status(404).send(`<!doctype html><html lang="en-GB"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Stock item not found | Automation Outlet</title><link rel="stylesheet" href="/styles.css"></head><body><main><section style="padding:5rem 0"><div class="wrap"><h1>Stock item not found</h1><p style="color:var(--grey);max-width:680px">This item may have moved or the link may be incorrect.</p><p style="margin-top:1.5rem"><a class="btn" href="/buy-stock.html">Browse current stock</a></p></div></section></main>
</body></html>`);
}

export function renderPage(product, products = []) {
  const slug = productSlug(product);
  const canonical = `${SITE}/stock/${slug}`;
  const inStock = availability(product);
  const part = text(product.partNumber, 120);
  const brand = text(product.brand, 80);
  const title = text(product.title, 180) || `${brand} ${part}`;
  const metaDescription = text(
    product.description || `${brand} ${part} industrial automation spare. ${product.condition || "Condition stated"}. Available from Automation Outlet in the UK.`,
    158
  );
  const price = money(product);
  const quantity = Math.max(0, Number.parseInt(product.quantity, 10) || 0);
  const descriptionHtml = html(product.description || "Contact us for full test details and condition photographs.").replace(/\n/g, "<br>");
  const waText = encodeURIComponent(`Hi, I'm interested in ${part} — ${title}. Is it still available?`);
  const statusLabel = inStock ? (quantity > 1 ? `${quantity} available` : "In stock") : "Sold / currently unavailable";
  const statusClass = inStock ? "live" : "sold";
  const primaryAction = inStock && product.ebayUrl
    ? `<a class="btn big" href="${html(product.ebayUrl)}" target="_blank" rel="noopener nofollow sponsored">Buy on eBay</a>`
    : `<a class="btn big" href="/obsolete-parts-sourcing.html">Ask us to source one</a>`;

  const productSchema = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: title,
    sku: part,
    mpn: part,
    brand: { "@type": "Brand", name: brand },
    description: metaDescription,
    ...(product.imageUrl ? { image: [product.imageUrl] } : {}),
    ...(price ? { offers: {
      "@type": "Offer",
      url: canonical,
      priceCurrency: "GBP",
      price,
      availability: inStock ? "https://schema.org/InStock" : "https://schema.org/OutOfStock",
      itemCondition: conditionSchema(product.condition),
      seller: { "@type": "Organization", name: "Automation Outlet", url: SITE },
    }} : {}),
  };

  const breadcrumbSchema = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: `${SITE}/` },
      { "@type": "ListItem", position: 2, name: "Current stock", item: `${SITE}/buy-stock.html` },
      { "@type": "ListItem", position: 3, name: `${brand} ${part}`, item: canonical },
    ],
  };

  return `<!DOCTYPE html>
<html lang="en-GB">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${html(`${brand} ${part} ${product.category || "Industrial Automation Part"} | Automation Outlet`)}</title>
<meta name="description" content="${html(metaDescription)}">
<link rel="canonical" href="${canonical}">
<meta property="og:type" content="product">
<meta property="og:site_name" content="Automation Outlet">
<meta property="og:title" content="${html(`${brand} ${part} | Automation Outlet`)}">
<meta property="og:description" content="${html(metaDescription)}">
<meta property="og:url" content="${canonical}">
${product.imageUrl ? `<meta property="og:image" content="${html(product.imageUrl)}">` : ""}
<meta property="og:locale" content="en_GB">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@600;700;800&family=Barlow:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/styles.css">
<script type="application/ld+json">${JSON.stringify(productSchema).replace(/</g, "\\u003c")}</script>
<script type="application/ld+json">${JSON.stringify(breadcrumbSchema).replace(/</g, "\\u003c")}</script>
<style>
${shopCss}
.product-page{padding:2.3rem 0 4rem}.crumbs{font-family:'IBM Plex Mono';font-size:.76rem;color:var(--grey);margin-bottom:1.4rem}.crumbs a{color:var(--blue-bright)}
.product-grid{display:grid;grid-template-columns:minmax(0,1fr) minmax(320px,.85fr);gap:2rem;align-items:start}.product-photo{background:var(--navy-card);border:1px solid var(--line);border-radius:var(--radius);overflow:hidden;min-height:320px;display:grid;place-items:center}.product-photo img{width:100%;height:auto;display:block}.product-photo .fallback{text-align:center;padding:3rem 1rem;color:var(--grey)}.product-photo .fallback strong{display:block;color:var(--white);font-family:'Barlow Condensed';font-size:2rem}.product-kicker{font-family:'IBM Plex Mono';font-size:.76rem;letter-spacing:.08em;text-transform:uppercase;color:var(--blue-bright)}.product-part{font-family:'IBM Plex Mono';font-size:1.05rem;color:var(--white);margin:.55rem 0}.product-status{display:inline-block;border:1px solid var(--line);border-radius:999px;padding:.35rem .7rem;font-family:'IBM Plex Mono';font-size:.72rem;margin:.4rem 0 1rem}.product-status.live{background:rgba(43,127,255,.12);color:var(--blue-bright)}.product-status.sold{color:var(--grey)}.product-price{font-family:'Barlow Condensed';font-size:2.4rem;font-weight:800;margin:1rem 0 .25rem}.product-meta{color:var(--grey);margin-bottom:1.2rem}.product-actions{display:flex;gap:.7rem;flex-wrap:wrap;margin:1.25rem 0}.product-copy{margin-top:1.4rem;padding-top:1.4rem;border-top:1px solid var(--line);color:var(--grey);line-height:1.65}.product-copy strong{color:var(--white)}.product-note{margin-top:1rem;padding:1rem;background:var(--navy-card);border:1px solid var(--line);border-radius:var(--radius);color:var(--grey)}
@media(max-width:820px){.product-grid{grid-template-columns:1fr}.product-photo{min-height:220px}}
</style>
</head>
<body>
${header()}
<main class="product-page">
  <div class="wrap">
    <div class="crumbs"><a href="/">Home</a> / <a href="/buy-stock.html">Current stock</a> / ${html(part)}</div>
    <div class="product-grid">
      <div class="product-photo">
        ${product.imageUrl ? `<img src="${html(product.imageUrl)}" alt="${html(`${brand} ${part} ${title}`)}">` : `<div class="fallback"><strong>${html(brand)}</strong><span>${html(part)}</span></div>`}
      </div>
      <article>
        <div class="product-kicker">${html(brand)} · ${html(product.category || "Industrial automation")}</div>
        <h1>${html(title)}</h1>
        <div class="product-part">Part number: ${html(part)}</div>
        <div class="product-status ${statusClass}">${html(statusLabel)}</div>
        <div class="product-price">${price ? "£"+html(price) : "Enquire for price"}</div>
        <div class="product-meta">${html(product.condition || "Condition stated")}</div>
        <p class="product-meta">Check the linked listing for delivery or collection options, charges and the final checkout total.</p>
        <div class="product-actions">
          ${primaryAction}
          <a class="btn big ghost" href="https://wa.me/${WA}?text=${waText}" target="_blank" rel="noopener">Enquire on WhatsApp</a>
        </div>
        ${!inStock ? `<div class="product-note"><strong>This unit is no longer available.</strong> The page remains live so you can send us the exact part number and we can check our incoming stock and supplier network.</div>` : ""}
        <div class="product-copy"><strong>Product details</strong><br><br>${descriptionHtml}</div>
      </article>
    </div>
    <section style="padding:2rem 0"><h2>Explore more automation spares</h2>${browseLinks()}
    <div class="shop-grid">${publicProducts(products).filter(p=>available(p)&&productSlug(p)!==slug&&(p.brand===product.brand||p.category===product.category)).slice(0,3).map(productCard).join('')}</div></section>
  </div>
</main>
<footer>
  <div class="wrap foot">
    <div><div class="logo"><span class="gear">&#9881;</span>Automation <span>Outlet</span></div><p style="margin-top:.5rem">Industrial automation solutions · Cambridgeshire, UK</p><p style="margin-top:.6rem">&#128241; <a href="https://wa.me/${WA}">07849 506371 (WhatsApp)</a> · &#9993; <a href="mailto:info@automation-outlet.co.uk">info@automation-outlet.co.uk</a></p></div>
  </div>
  <div class="wrap" style="margin-top:1.4rem;padding-top:1.2rem;border-top:1px solid var(--line);font-size:.82rem;color:var(--grey)"><a href="/privacy.html">Privacy notice</a></div>
</footer>
${menuScript}
</body>
</html>`;
}

export default async function handler(request, response) {
  try {
    if (request.method !== "GET" && request.method !== "HEAD") {
      response.setHeader("Allow", "GET, HEAD");
      return response.status(405).send("Method not allowed");
    }

    const requestedSlug = slugify(request.query?.slug || "");
    if (!requestedSlug) return notFound(response);

    const products = await listProducts();
    const product = findProduct(products, requestedSlug);
    if (!product) return notFound(response);

    const canonicalSlug = productSlug(product);
    if (requestedSlug !== canonicalSlug) {
      response.setHeader("Location", `/stock/${canonicalSlug}`);
      return response.status(308).send("Permanent redirect");
    }

    response.setHeader("Content-Type", "text/html; charset=utf-8");
    response.setHeader("Cache-Control", "public, s-maxage=60, stale-while-revalidate=300");
    return response.status(200).send(renderPage(product, products));
  } catch (error) {
    console.error("Product page error", error);
    response.setHeader("Content-Type", "text/html; charset=utf-8");
    response.setHeader("Cache-Control", "no-store");
    response.setHeader("X-Robots-Tag", "noindex, nofollow");
    return response.status(error.status || 500).send("Stock page temporarily unavailable");
  }
}

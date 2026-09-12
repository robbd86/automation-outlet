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

function shopDescription(value, fallback = "") {
  return String(value || fallback || "")
    .replace(/Full listing details and photographs are available via the linked eBay listing\.?/gi, "")
    .replace(/Full details (?:are )?available (?:on|via) eBay\.?/gi, "")
    .replace(/See (?:the )?eBay listing for (?:full )?details(?: and photographs)?\.?/gi, "")
    .replace(/in the imported eBay report/gi, "")
    .replace(/Condition as stated in the listing\./gi, "Condition stated above.")
    .replace(/\s{2,}/g, " ")
    .replace(/\s+([.,;:])/g, "$1")
    .trim();
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
  const fallbackDescription = `${brand} ${part} industrial automation spare. ${product.condition || "Condition stated"}. Available from Automation Outlet in the UK.`;
  const cleanDescription = shopDescription(product.description, fallbackDescription);
  const metaDescription = text(cleanDescription, 158);
  const price = money(product);
  const descriptionHtml = html(cleanDescription || "Contact us for test details, serial confirmation or additional photographs.").replace(/\n/g, "<br>");
  const waText = encodeURIComponent(`Hi, I'm interested in ${part} — ${title}. Is it still available?`);
  const statusLabel = inStock ? "In stock – UK" : "Sold / currently unavailable";
  const statusClass = inStock ? "live" : "sold";
  const primaryAction = inStock && price
    ? `<button class="btn big add-basket" type="button" data-add-to-cart data-id="${html(slug)}" data-title="${html(title)}" data-part="${html(part)}" data-brand="${html(brand)}" data-price="${html(price)}" data-image="${html(product.imageUrl || "")}" data-url="/stock/${html(slug)}" data-quantity-target="#productQty">Add to basket</button>`
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
.product-page{padding:1.6rem 0 4rem}.crumbs{font-family:'IBM Plex Mono';font-size:.74rem;color:var(--grey);margin-bottom:1.2rem}.crumbs a{color:var(--blue-bright)}
.product-layout{display:grid;grid-template-columns:minmax(0,1.08fr) minmax(360px,.92fr);gap:2.4rem;align-items:start}.gallery-panel{min-width:0}.product-photo{background:#fff;border:1px solid var(--line);border-radius:16px;overflow:hidden;min-height:520px;display:grid;place-items:center}.product-photo img{width:100%;max-height:620px;object-fit:contain;display:block}.product-photo .fallback{text-align:center;padding:4rem 1rem;color:#6b7584}.product-photo .fallback strong{display:block;color:#17233a;font-family:'Barlow Condensed';font-size:2.2rem}.photo-caption{margin-top:.7rem;color:var(--grey);font-size:.78rem}
.buy-panel{position:sticky;top:152px;background:linear-gradient(180deg,var(--navy-card),#0b1b35);border:1px solid var(--line);border-radius:16px;padding:1.55rem;box-shadow:0 22px 60px rgba(0,0,0,.22)}.product-kicker{font-family:'IBM Plex Mono';font-size:.74rem;letter-spacing:.09em;text-transform:uppercase;color:var(--blue-bright)}.buy-panel h1{text-transform:none;font-size:clamp(2rem,3vw,3rem);line-height:1.02;margin:.45rem 0 .55rem}.product-part{font-family:'IBM Plex Mono';font-size:1rem;color:var(--white);overflow-wrap:anywhere}.product-status{display:inline-flex;align-items:center;gap:.45rem;border:1px solid rgba(107,226,153,.3);border-radius:999px;padding:.36rem .7rem;font-family:'IBM Plex Mono';font-size:.72rem;margin:1rem 0 .8rem}.product-status.live{background:rgba(55,199,115,.1);color:#8fe3b1}.product-status.sold{border-color:var(--line);color:var(--grey)}.product-price{font-family:'Barlow Condensed';font-size:3rem;font-weight:800;line-height:1;margin:.5rem 0 .2rem}.vat-note{font-size:.86rem;color:var(--grey);margin-bottom:1rem}.condition-box{display:grid;grid-template-columns:auto 1fr;gap:.35rem .9rem;padding:.9rem 0;border-top:1px solid var(--line);border-bottom:1px solid var(--line);font-size:.92rem}.condition-box span{color:var(--grey)}.condition-box strong{color:var(--white)}.stock-line{margin:.9rem 0;color:var(--grey);font-size:.9rem}.stock-line b{color:#8fe3b1}.purchase-row{display:grid;grid-template-columns:132px 1fr;gap:.7rem;align-items:end;margin-top:1rem}.qty-wrap label{font-size:.78rem;color:var(--grey)}.qty-control{display:grid;grid-template-columns:40px 1fr 40px;border:1px solid var(--line);border-radius:10px;overflow:hidden;height:48px}.qty-control button{border:0;background:rgba(255,255,255,.04);color:var(--white);font-size:1.2rem;cursor:pointer}.qty-control input{border:0;border-left:1px solid var(--line);border-right:1px solid var(--line);border-radius:0;text-align:center;padding:.5rem;background:transparent}.add-basket{width:100%;height:48px;padding:.6rem 1rem}.product-actions{display:flex;gap:.7rem;flex-wrap:wrap;margin:1rem 0}.secondary-actions{display:grid;grid-template-columns:1fr 1fr;gap:.65rem;margin-top:.7rem}.secondary-actions .btn{padding:.72rem .7rem;text-align:center;font-size:.95rem}.text-action{display:block;text-align:center;margin-top:.8rem;font-size:.84rem;color:var(--grey)}.trust-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:.55rem;margin-top:1.1rem}.trust-item{padding:.68rem .72rem;background:rgba(255,255,255,.025);border:1px solid rgba(77,148,255,.12);border-radius:9px;font-size:.8rem;color:var(--grey)}.trust-item b{display:block;color:var(--white);font-size:.84rem}
.detail-sections{margin-top:2rem;display:grid;gap:.7rem}.detail-sections details{background:var(--navy-card);border:1px solid var(--line);border-radius:12px;padding:0 1rem}.detail-sections summary{cursor:pointer;list-style:none;font-weight:700;padding:1rem 0}.detail-sections summary::-webkit-details-marker{display:none}.detail-sections summary:after{content:'+';float:right;color:var(--blue-bright)}.detail-sections details[open] summary:after{content:'–'}.detail-body{border-top:1px solid var(--line);padding:1rem 0 1.2rem;color:var(--grey);line-height:1.7}.detail-body strong{color:var(--white)}.product-note{margin-top:1rem;padding:1rem;background:var(--navy-card);border:1px solid var(--line);border-radius:var(--radius);color:var(--grey)}
@media(max-width:900px){.product-layout{grid-template-columns:1fr;gap:1.25rem}.product-photo{min-height:360px}.buy-panel{position:static}.purchase-row{grid-template-columns:120px 1fr}}
@media(max-width:640px){.product-page{padding-top:.9rem;padding-bottom:1.2rem}.crumbs{font-size:.68rem;margin-bottom:.8rem}.product-photo{min-height:260px;border-radius:12px}.product-photo img{max-height:360px}.buy-panel{padding:1.1rem;border-radius:12px}.buy-panel h1{font-size:2rem}.product-price{font-size:2.65rem}.purchase-row{grid-template-columns:108px 1fr}.secondary-actions{grid-template-columns:1fr}.trust-grid{grid-template-columns:1fr 1fr}}
</style>
</head>
<body>
${header()}
<main class="product-page">
  <div class="wrap">
    <div class="crumbs"><a href="/">Home</a> / <a href="/buy-stock.html">Current stock</a> / ${html(part)}</div>
    <div class="product-layout">
      <div class="gallery-panel">
        <div class="product-photo">${product.imageUrl ? `<img src="${html(product.imageUrl)}" alt="${html(`${brand} ${part} ${title}`)}">` : `<div class="fallback"><strong>${html(brand)}</strong><span>${html(part)}</span></div>`}</div>
        <div class="photo-caption">Actual stock image where supplied. Confirm the complete part number and revision before ordering.</div>
      </div>
      <article class="buy-panel">
        <div class="product-kicker">${html(brand)} · ${html(product.category || "Industrial automation")}</div>
        <h1>${html(title)}</h1>
        <div class="product-part">${html(part)}</div>
        <div class="product-status ${statusClass}">${inStock ? "● " : ""}${html(statusLabel)}</div>
        <div class="product-price">${price ? "£"+html(price) : "Enquire for price"}</div>
        ${price ? '<div class="vat-note">No VAT added to this price.</div>' : ''}
        <div class="condition-box"><span>Condition</span><strong>${html(product.condition || "Condition stated")}</strong><span>Location</span><strong>United Kingdom</strong></div>
        <div class="stock-line">${inStock ? '<b>Available now.</b> Dispatch timing confirmed with your order.' : 'This exact unit is not currently available.'}</div>
        ${inStock && price ? `<div class="purchase-row"><div class="qty-wrap"><label for="productQty">Quantity</label><div class="qty-control"><button type="button" id="qtyMinus" aria-label="Decrease quantity">−</button><input id="productQty" type="number" min="1" max="99" value="1" inputmode="numeric"><button type="button" id="qtyPlus" aria-label="Increase quantity">+</button></div></div>${primaryAction}</div>` : `<div class="product-actions">${primaryAction}</div>`}
        <div class="secondary-actions"><a class="btn ghost" href="/contact.html?part=${encodeURIComponent(part)}">Request trade price</a><a class="btn ghost" href="https://wa.me/${WA}?text=${waText}" target="_blank" rel="noopener">Make an enquiry</a></div>
        <div class="trust-grid"><div class="trust-item"><b>UK based</b>Cambridgeshire stock network</div><div class="trust-item"><b>Worldwide shipping</b>Quoted for your destination</div><div class="trust-item"><b>Secure ordering</b>Basket ready for checkout</div><div class="trust-item"><b>Industrial specialist</b>Exact part-number focus</div></div>
        ${!inStock ? `<div class="product-note"><strong>This unit is no longer available.</strong> Send us the exact part number and we can check incoming stock and our supplier network.</div>` : ""}
      </article>
    </div>
    <div class="detail-sections">
      <details open><summary>Product details</summary><div class="detail-body">${descriptionHtml}</div></details>
      <details><summary>Condition &amp; stock</summary><div class="detail-body"><strong>${html(product.condition || "Condition stated")}</strong><br>Supplied as described and pictured. Ask if you require serial-number, seal or packaging photographs before ordering.</div></details>
      <details><summary>Delivery &amp; worldwide shipping</summary><div class="detail-body">UK and international delivery can be arranged. Dispatch timing and final carriage cost are confirmed for the order, particularly for multi-quantity and seller-held consignment stock.</div></details>
      <details><summary>Payment &amp; trade orders</summary><div class="detail-body">Add the item to your basket to prepare an order. Trade buyers can request a pro-forma invoice or quantity price. Card checkout will connect to the same basket flow.</div></details>
    </div>
    <section style="padding:2.5rem 0 0"><h2>Related automation spares</h2><div class="shop-grid" style="margin-top:1rem">${publicProducts(products).filter(p=>available(p)&&productSlug(p)!==slug&&(p.brand===product.brand||p.category===product.category)).slice(0,4).map(productCard).join('')}</div></section>
    <section style="padding:2rem 0 0"><h2>Browse more stock</h2>${browseLinks()}</section>
  </div>
</main>
<footer>
  <div class="wrap foot">
    <div><div class="logo"><span class="gear">&#9881;</span>Automation <span>Outlet</span></div><p style="margin-top:.5rem">Industrial automation solutions · Cambridgeshire, UK</p><p style="margin-top:.6rem">&#128241; <a href="https://wa.me/${WA}">07849 506371 (WhatsApp)</a> · &#9993; <a href="mailto:info@automation-outlet.co.uk">info@automation-outlet.co.uk</a></p></div>
  </div>
  <div class="wrap" style="margin-top:1.4rem;padding-top:1.2rem;border-top:1px solid var(--line);font-size:.82rem;color:var(--grey)"><a href="/privacy.html">Privacy notice</a></div>
</footer>
${menuScript}
<script>const q=document.getElementById('productQty');document.getElementById('qtyMinus')?.addEventListener('click',()=>q.value=Math.max(1,Number(q.value||1)-1));document.getElementById('qtyPlus')?.addEventListener('click',()=>q.value=Math.min(99,Number(q.value||1)+1));</script>
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

import { collections, available, publicProducts, productSlug, slugify } from "../lib/shop.mjs";
import { listProducts } from "../lib/stock-read.mjs";
const SITE = "https://www.automation-outlet.co.uk";

function xml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export function renderSitemap(products) {
  // Use the same live, inventory-adjusted availability as the public catalogue.
  // Don't spend Googlebot crawl time advertising sold or exhausted products.
  const liveProducts = publicProducts(products).filter(available);

  const urls = [...liveProducts]
    .sort((left, right) => productSlug(left).localeCompare(productSlug(right)))
    .map((product) => {
      const slug = productSlug(product);
      const updated = String(product.updatedAt || product.createdAt || "").slice(0, 10);
      const lastmod = /^\\d{4}-\\d{2}-\\d{2}$/.test(updated)
        ? `\\n    <lastmod>${xml(updated)}</lastmod>`
        : "";
      return `  <url>\\n    <loc>${xml(`${SITE}/stock/${slug}`)}</loc>${lastmod}\\n  </url>`;
    })
    .join("\\n");

  // Only advertise category routes that have live stock. The catalogue
  // intentionally noindexes empty categories; do not place those in a sitemap.
  const collectionKeys = new Set(
    Object.entries(collections)
      .filter(([, collection]) => liveProducts.some((product) => collection.match(product)))
      .map(([key]) => key)
  );
  for (const product of liveProducts) {
    const brandSlug = slugify(product.brand);
    if (brandSlug) collectionKeys.add(brandSlug);
  }
  const collectionUrls = [...collectionKeys]
    .sort((a, b) => a.localeCompare(b))
    .map(key => `  <url><loc>${SITE}/parts${key === "all" ? "" : "/" + key}</loc></url>`)
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${collectionUrls}\n${urls}\n</urlset>\n`;
}

export default async function handler(request, response) {
  try {
    if (request.method !== "GET" && request.method !== "HEAD") {
      response.setHeader("Allow", "GET, HEAD");
      return response.status(405).send("Method not allowed");
    }

    const products = await listProducts();
    response.setHeader("Content-Type", "application/xml; charset=utf-8");
    response.setHeader("Cache-Control", "public, s-maxage=300, stale-while-revalidate=3600");
    return response.status(200).send(renderSitemap(products));
  } catch (error) {
    console.error("Stock sitemap error", error);
    response.setHeader("Content-Type", "text/plain; charset=utf-8");
    response.setHeader("Cache-Control", "no-store");
    return response.status(error.status || 500).send("Stock sitemap temporarily unavailable");
  }
}

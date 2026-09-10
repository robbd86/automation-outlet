import { listProducts } from '../lib/stock-read.mjs';
import { SITE, collections, html, json, available, publicProducts, productSlug, productCard, header, menuScript, browseLinks, shopCss } from '../lib/shop.mjs';

export function renderCatalogue(key, products) {
  const collection = collections[key];
  const items = publicProducts(products).filter(p=>available(p)&&collection.match(p));
  const canonical = SITE+'/parts'+(key==='all'?'':'/'+key);
  const schema = {
    '@context':'https://schema.org', '@type':'CollectionPage', name:collection.title, url:canonical,
    description:collection.intro,
    mainEntity:{'@type':'ItemList', numberOfItems:items.length, itemListElement:items.map((p,i)=>({'@type':'ListItem',position:i+1,name:p.title,url:SITE+'/stock/'+productSlug(p)}))},
  };
  const breadcrumb = {'@context':'https://schema.org','@type':'BreadcrumbList',itemListElement:[
    {'@type':'ListItem',position:1,name:'Home',item:SITE+'/'},
    ...(key==='all'?[]:[{'@type':'ListItem',position:2,name:'All parts',item:SITE+'/parts'}]),
    {'@type':'ListItem',position:key==='all'?2:3,name:collection.name,item:canonical},
  ]};
  return `<!doctype html><html lang="en-GB"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${html(collection.title)} | Automation Outlet</title><meta name="description" content="${html(collection.intro)}"><link rel="canonical" href="${canonical}">
  ${items.length?'':'<meta name="robots" content="noindex,follow">'}
  <meta property="og:type" content="website"><meta property="og:site_name" content="Automation Outlet"><meta property="og:title" content="${html(collection.title)}"><meta property="og:description" content="${html(collection.intro)}"><meta property="og:url" content="${canonical}">
  <link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@600;700;800&family=Barlow:wght@400;500;600;700&display=swap" rel="stylesheet"><link rel="stylesheet" href="/styles.css">
  <script type="application/ld+json">${json(schema)}</script><script type="application/ld+json">${json(breadcrumb)}</script><style>${shopCss}</style></head><body>
  ${header()}<main><section style="padding:2rem 0 3rem"><div class="wrap"><nav aria-label="Breadcrumb"><a href="/">Home</a> / <a href="/parts">Parts</a>${key==='all'?'':' / '+html(collection.name)}</nav>
  <h1 class="shop-heading" style="margin-top:1.5rem">${html(collection.title)}</h1><p class="shop-intro">${html(collection.intro)}</p>
  <form action="/buy-stock.html#stock" method="get" role="search"><label for="part-search">Search by part number or description</label><div style="display:flex;gap:.6rem;flex-wrap:wrap"><input id="part-search" type="search" name="q" required style="flex:1;min-width:180px"><button class="btn">Search stock</button></div></form>
  ${browseLinks()}<p style="margin:1rem 0">${items.length} current stock ${items.length===1?'listing':'listings'}. Open an item for condition and buying details.</p>
  <div class="shop-grid">${items.map(productCard).join('')||'<p>No matching stock is currently listed. <a href="/obsolete-parts-sourcing.html">Ask us to source your part</a>.</p>'}</div>
  <section style="padding:2rem 0"><h2>Before you order</h2><p class="shop-intro">${html(collection.advice)}</p><p class="shop-intro">Where a listing links to eBay, purchase through that listing and check the final total, delivery charges and returns terms there. For other items or compatibility questions, contact us with the exact part number.</p>
  <a class="btn" href="/obsolete-parts-sourcing.html">Request a hard-to-find part</a> <a href="/buyer-alerts.html">Get stock alerts</a></section></div></section></main>
  <footer><div class="wrap"><p>Automation Outlet · Industrial automation spares · Cambridgeshire, UK</p><p><a href="mailto:info@automation-outlet.co.uk">info@automation-outlet.co.uk</a> · <a href="https://wa.me/447849506371">07849 506371</a></p><p><a href="/contact.html">Contact</a> · <a href="/privacy.html">Privacy notice</a></p></div></footer>${menuScript}</body></html>`;
}

export default async function handler(request,response){
  response.setHeader('Content-Type','text/html; charset=utf-8');
  if(!['GET','HEAD'].includes(request.method)){response.setHeader('Allow','GET, HEAD');return response.status(405).send('Method not allowed');}
  const key=String(request.query?.collection||'all');
  if(!Object.hasOwn(collections,key)){response.setHeader('X-Robots-Tag','noindex, follow');return response.status(404).send('<h1>Category not found</h1><a href="/parts">Browse current parts</a>');}
  try{
    const products=await listProducts();
    response.setHeader('Cache-Control','public, s-maxage=60, stale-while-revalidate=300');
    return response.status(200).send(renderCatalogue(key,products));
  }catch(error){
    console.error('Catalogue unavailable',error.message);
    response.setHeader('Cache-Control','no-store');response.setHeader('Retry-After','300');
    return response.status(503).send('<h1>Stock temporarily unavailable</h1><p>Please try again shortly or <a href="/contact.html">contact Automation Outlet</a> with your part number.</p>');
  }
}

#!/usr/bin/env python3
"""Search Console-led SEO improvements for the seller and buyer funnels.

Applied after the normal build/stock/conversion patches so the production HTML keeps
conversion behaviour while targeting the queries already gaining impressions.
"""

from pathlib import Path
import re
import json

ROOT = Path(__file__).resolve().parent


def replace_tag_content(html: str, tag_pattern: str, replacement: str, label: str) -> str:
    updated, count = re.subn(tag_pattern, replacement, html, count=1, flags=re.IGNORECASE | re.DOTALL)
    if count != 1:
        raise RuntimeError(f"Could not patch {label}")
    return updated


def patch_head(html: str, title: str, description: str) -> str:
    html = replace_tag_content(html, r"<title>.*?</title>", f"<title>{title}</title>", "page title")
    html = replace_tag_content(
        html,
        r'<meta name="description" content="[^"]*">',
        f'<meta name="description" content="{description}">',
        "meta description",
    )
    html = replace_tag_content(
        html,
        r'<meta property="og:title" content="[^"]*">',
        f'<meta property="og:title" content="{title}">',
        "Open Graph title",
    )
    html = replace_tag_content(
        html,
        r'<meta property="og:description" content="[^"]*">',
        f'<meta property="og:description" content="{description}">',
        "Open Graph description",
    )
    return html


def patch_sell_page() -> None:
    path = ROOT / "sell-surplus.html"
    html = path.read_text(encoding="utf-8")

    title = "Sell Automation Parts UK | Surplus PLCs, HMIs &amp; Drives | Automation Outlet"
    description = (
        "Sell automation parts in the UK, including surplus PLCs, HMIs, drives, I/O and control hardware. "
        "Cash purchase, selective offers or managed consignment."
    )
    html = patch_head(html, title, description)

    html = replace_tag_content(
        html,
        r'(<div class="eyebrow">Sell to us &middot; UK wide</div>\s*)<h1[^>]*>.*?</h1>',
        r'\1<h1 style="font-size:clamp(2.2rem,6vw,3.9rem)">Sell your <em>surplus automation parts</em> in the UK</h1>',
        "seller H1",
    )

    hero_intro_re = re.compile(
        r'(<h1[^>]*>Sell your <em>surplus automation parts</em> in the UK</h1>\s*)<p>.*?</p>',
        flags=re.IGNORECASE | re.DOTALL,
    )
    hero_intro = (
        "Selling used or surplus PLCs, HMIs, drives, I/O, control hardware or complete panels? "
        "Send the part numbers and quantities and we will assess the best route: cash purchase, selective purchase, "
        "brokerage or managed consignment. UK-wide."
    )
    html, count = hero_intro_re.subn(rf'\1<p>{hero_intro}</p>', html, count=1)
    if count != 1:
        raise RuntimeError("Could not patch seller hero introduction")

    if 'id="sell-automation-parts-uk"' not in html:
        supporting = '''<section id="sell-automation-parts-uk" style="padding:2.6rem 0">
  <div class="wrap">
    <div class="sec-head"><h2>Sell automation parts in the <span>UK</span></h2></div>
    <p style="color:var(--grey);max-width:820px;margin-bottom:1rem">Automation Outlet buys and manages the resale of surplus industrial automation equipment across the UK, including used PLCs, CPUs, HMIs, drives, remote I/O, safety modules and control hardware. Part numbers, quantities and photographs are usually enough for an initial assessment.</p>
    <p style="color:var(--grey);max-width:820px">For stock suited to an immediate purchase we can make a cash offer. For higher-value or slower-moving equipment, we can also discuss selective purchase, brokerage or managed consignment so you are not forced into a single route.</p>
  </div>
</section>'''
        marker = '</section><section id="how">'
        if marker not in html:
            raise RuntimeError("Could not find seller supporting-content insertion point")
        html = html.replace(marker, f'</section>{supporting}<section id="how">', 1)

    path.write_text(html, encoding="utf-8")
    print("patched: seller SEO")


def patch_buy_page() -> None:
    path = ROOT / "buy-stock.html"
    html = path.read_text(encoding="utf-8")

    title = "Used PLCs for Sale UK | Surplus Automation Parts | Automation Outlet"
    description = (
        "Buy used PLCs and surplus automation equipment in the UK. Search Siemens, Allen-Bradley, Omron, Mitsubishi, "
        "HMIs, drives and obsolete parts by part number."
    )
    html = patch_head(html, title, description)

    html = replace_tag_content(
        html,
        r'(<div class="eyebrow">Buy &middot;[^<]*</div>\s*)<h1[^>]*>.*?</h1>',
        r'\1<h1 style="font-size:clamp(2.2rem,6vw,3.9rem)">Used PLCs &amp; <em>automation parts</em> for sale in the UK</h1>',
        "buyer H1",
    )

    hero_intro_re = re.compile(
        r'(<h1[^>]*>Used PLCs &amp; <em>automation parts</em> for sale in the UK</h1>\s*)<p>.*?</p>',
        flags=re.IGNORECASE | re.DOTALL,
    )
    hero_intro = (
        "Search live UK stock of used and surplus PLCs, HMIs, drives, I/O and industrial automation spares. "
        "Every listing states the condition, test status and what is included, with exact part-number search for obsolete and hard-to-find equipment."
    )
    html, count = hero_intro_re.subn(rf'\1<p>{hero_intro}</p>', html, count=1)
    if count != 1:
        raise RuntimeError("Could not patch buyer hero introduction")

    if 'id="used-plcs-uk"' not in html:
        supporting = '''<section id="used-plcs-uk" style="padding:2.6rem 0">
  <div class="wrap">
    <div class="sec-head"><h2>Used PLCs for sale in the <span>UK</span></h2></div>
    <p style="color:var(--grey);max-width:820px;margin-bottom:1rem">Our live stock includes used and surplus PLCs, CPUs, I/O modules, HMIs and drives from Siemens, Allen-Bradley, Omron, Mitsubishi, ABB and other industrial automation manufacturers. Search by the exact manufacturer part number above to find the quickest match.</p>
    <p style="color:var(--grey);max-width:820px">If the part you need is not currently listed, send us the part number through our <a href="/obsolete-parts-sourcing.html">obsolete parts sourcing service</a>. We can check incoming stock and our supplier network for discontinued and hard-to-find controls.</p>
  </div>
</section>'''
        marker = '<section style="padding:3.2rem 0"><div class="wrap"><div class="sec-head"><h2>Why buy <span>from us</span></h2>'
        if marker not in html:
            raise RuntimeError("Could not find buyer supporting-content insertion point")
        html = html.replace(marker, supporting + marker, 1)

    path.write_text(html, encoding="utf-8")
    print("patched: buyer SEO")


def patch_buyer_discovery() -> None:
    path = ROOT / "index.html"
    html = path.read_text(encoding="utf-8")
    html = patch_head(html,
        "Used &amp; Surplus PLCs, HMIs &amp; Drives UK | Automation Outlet",
        "Buy and sell new, used and surplus industrial automation parts in the UK. Browse Siemens, Allen-Bradley and Omron PLCs, I/O and drives by part number.")
    html = replace_tag_content(html, r'<h1[^>]*>.*?</h1>',
        '<h1 style="font-size:clamp(2.2rem,6vw,3.9rem)">Buy &amp; sell <em>surplus PLCs, HMIs &amp; drives</em></h1>', "homepage heading")
    html = html.replace(
        '<a href="/sell-surplus.html" class="btn big">Sell your surplus</a><a href="/buy-stock.html" class="btn big ghost">Browse stock</a>',
        '<a href="/buy-stock.html" class="btn big">Browse stock</a><a href="/sell-surplus.html" class="btn big ghost">Sell your surplus</a>')
    org = {"@context":"https://schema.org", "@type":"Organization", "@id":"https://www.automation-outlet.co.uk/#organization",
           "name":"Automation Outlet", "url":"https://www.automation-outlet.co.uk/", "logo":"https://www.automation-outlet.co.uk/ao-site-logo.svg",
           "email":"info@automation-outlet.co.uk", "telephone":"+447849506371"}
    if 'id="ao-organization"' not in html:
        html = html.replace('</head>', '<script id="ao-organization" type="application/ld+json">'+json.dumps(org)+'</script>\n</head>')
    path.write_text(html, encoding="utf-8")

    links = [('All current parts','/parts'),('Siemens','/parts/siemens'),('Allen-Bradley','/parts/allen-bradley'),
             ('Omron','/parts/omron'),('PLC processors','/parts/plc-processors'),('PLC I/O modules','/parts/plc-io-modules'),('Drives &amp; inverters','/parts/drives-inverters')]
    navigation = '<nav aria-label="Browse parts by brand or type" style="display:flex;flex-wrap:wrap;gap:.6rem;margin:1rem 0">'+''.join(
        f'<a href="{url}" style="padding:.5rem .8rem;border:1px solid var(--line);border-radius:8px">{label}</a>' for label,url in links)+'</nav>'
    section = '<section id="browse-parts" style="padding:2rem 0"><div class="wrap"><h2>Shop by brand or equipment type</h2><p style="color:var(--grey);margin-top:.6rem">Browse current stock, check the complete part number and open a listing for condition and buying details.</p>'+navigation+'</div></section>'
    for name in ('index.html','buy-stock.html'):
        path=ROOT/name
        html=path.read_text(encoding='utf-8')
        if 'id="browse-parts"' not in html:
            marker='<section id="home-featured-stock"' if name=='index.html' else '<section id="stock"'
            if marker not in html: raise RuntimeError(f'Missing stock section in {name}')
            html=html.replace(marker,section+marker,1)
        path.write_text(html,encoding='utf-8')
    for path in ROOT.glob('*.html'):
        if path.name in ('stock-admin.html','deal-desk.html'): continue
        html=path.read_text(encoding='utf-8')
        if 'id="parts-footer-link"' not in html:
            html=html.replace('</footer>','<div class="wrap" id="parts-footer-link" style="padding-top:1rem"><a href="/parts">Browse industrial automation parts for sale</a></div></footer>',1)
        path.write_text(html,encoding='utf-8')
    print('patched: buyer discovery and organisation data')


def main() -> None:
    patch_sell_page()
    patch_buy_page()
    patch_buyer_discovery()


if __name__ == "__main__":
    main()

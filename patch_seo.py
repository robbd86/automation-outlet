#!/usr/bin/env python3
"""Search Console-led SEO improvements for the seller and buyer funnels.

Applied after the normal build/stock/conversion patches so the production HTML keeps
conversion behaviour while targeting the queries already gaining impressions.
"""

from pathlib import Path
import re

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


def main() -> None:
    patch_sell_page()
    patch_buy_page()


if __name__ == "__main__":
    main()

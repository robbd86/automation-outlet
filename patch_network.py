#!/usr/bin/env python3
"""Add buyer/supplier network entry points to generated public pages."""

from pathlib import Path

ROOT = Path(__file__).resolve().parent
ADMIN_PAGES = {"stock-admin.html", "deal-desk.html", "buyer-network-admin.html"}


def patch_buyer_nav() -> None:
    needle = '>Buy stock</a><a href="/obsolete-parts-sourcing.html"'
    replacement = '>Buy stock</a><a href="/buyer-alerts.html">Buyer Network</a><a href="/obsolete-parts-sourcing.html"'
    for path in ROOT.glob("*.html"):
        if path.name in ADMIN_PAGES:
            continue
        html = path.read_text(encoding="utf-8")
        if '/buyer-alerts.html">Buyer Network</a>' in html:
            continue
        if needle in html:
            html = html.replace(needle, replacement)
            path.write_text(html, encoding="utf-8")
            print(f"patched Buyer Network nav: {path.name}")


def patch_home() -> None:
    path = ROOT / "index.html"
    html = path.read_text(encoding="utf-8")

    for old in (
        '<div class="hero-ctas"><a href="/sell-surplus.html" class="btn big">Sell your surplus</a><a href="/buy-stock.html" class="btn big ghost">Buy tested stock</a></div>',
        '<div class="hero-ctas"><a href="/sell-surplus.html" class="btn big">Sell your surplus</a><a href="/buy-stock.html" class="btn big ghost">Browse stock</a></div>',
    ):
        if old in html:
            new = old[:-6] + '<a href="/buyer-alerts.html" class="btn big ghost">Join Buyer Network</a></div>'
            html = html.replace(old, new, 1)
            break

    if 'id="ao-buyer-network-home"' not in html:
        block = '''<section id="ao-buyer-network-home" style="padding:2.8rem 0">
  <div class="wrap">
    <div class="sec-head">
      <div class="eyebrow">For buyers</div>
      <h2>Get first access to <span>incoming automation stock</span></h2>
      <p>Join the AO Buyer Network once and tell us what you buy. Matching PLCs, HMIs, drives, servo equipment, obsolete parts and job lots can be offered directly to you before wider public marketing.</p>
    </div>
    <div class="paths" style="margin:0">
      <div class="path"><h3>Early <span>access</span></h3><p>See selected incoming stock before it reaches marketplaces.</p></div>
      <div class="path"><h3>Wanted <span>list</span></h3><p>Keep your regular manufacturers, ranges and part numbers on file with AO.</p></div>
      <div class="path"><h3>Trade <span>opportunities</span></h3><p>Register for batches, mixed job lots and complete clearance opportunities.</p></div>
    </div>
    <div class="hero-ctas" style="margin-top:1.25rem"><a href="/buyer-alerts.html" class="btn big">Join the AO Buyer Network</a><a href="/buy-stock.html" class="btn big ghost">Browse current stock</a></div>
    <p class="services-note" style="margin-top:1rem">No generic newsletter &mdash; alerts are matched to your buying profile.</p>
  </div>
</section>'''
        needle = '<section class="quote" style="padding:3.2rem 0">'
        if needle in html:
            html = html.replace(needle, block + needle, 1)

    path.write_text(html, encoding="utf-8")
    print("patched homepage Buyer Network")


def patch_buy() -> None:
    path = ROOT / "buy-stock.html"
    html = path.read_text(encoding="utf-8")
    if 'id="ao-buyer-network-buy"' in html:
        return
    block = '''<section id="ao-buyer-network-buy" class="quote" style="padding:3rem 0">
  <div class="wrap">
    <div class="sec-head">
      <div class="eyebrow">AO Buyer Network</div>
      <h2>Can't see what you need? <span>Tell us what you buy.</span></h2>
      <p>Register your manufacturers, equipment types and wanted ranges once. We can contact you when matching surplus stock arrives, including selected opportunities before wider marketing.</p>
    </div>
    <a href="/buyer-alerts.html" class="btn big">Join the AO Buyer Network</a>
    <p class="services-note" style="margin-top:1rem">Ideal for maintenance teams, system integrators, machine builders and automation resellers.</p>
  </div>
</section>'''
    needle = '<section style="padding:3.2rem 0"><div class="wrap"><div class="sec-head"><h2>Why buy <span>from us</span></h2>'
    if needle in html:
        html = html.replace(needle, block + needle, 1)
    elif '</main>' in html:
        html = html.replace('</main>', block + '</main>', 1)
    path.write_text(html, encoding="utf-8")
    print("patched buy page Buyer Network")


def patch_sell() -> None:
    path = ROOT / "sell-surplus.html"
    html = path.read_text(encoding="utf-8")
    if 'id="ao-supplier-network"' in html:
        return
    block = '''<section id="ao-supplier-network" class="quote" style="padding:3rem 0">
  <div class="wrap">
    <div class="sec-head">
      <h2>Not selling today? <span>Stay connected.</span></h2>
      <p>If your business regularly comes across redundant PLCs, HMIs, drives, panels or machinery, join our supplier network and contact us when the next opportunity appears.</p>
    </div>
    <a href="/supplier-network.html" class="btn big">Join supplier network</a>
  </div>
</section>'''
    needle = '<section class="brands">'
    if needle in html:
        html = html.replace(needle, block + needle, 1)
        path.write_text(html, encoding="utf-8")


def main() -> None:
    patch_home()
    patch_buy()
    patch_sell()
    patch_buyer_nav()


if __name__ == "__main__":
    main()

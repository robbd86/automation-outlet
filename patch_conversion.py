#!/usr/bin/env python3
"""Conversion-focused production tweaks applied after the normal static build."""

from pathlib import Path
import re

ROOT = Path(__file__).resolve().parent


def patch_sell_page() -> None:
    path = ROOT / "sell-surplus.html"
    html = path.read_text(encoding="utf-8")

    html = html.replace(
        "PLCs, HMIs, drives, control panels and spares-store stock &mdash; working, untested or faulty. List what you've got below and we'll come back with a fair, no-obligation offer, usually the same working day.",
        "PLCs, HMIs, drives, control panels and spares-store stock &mdash; working, untested or faulty. Choose a cash purchase, managed consignment or brokerage route, or let us recommend the best fit.",
    )

    # Put the seller portal immediately after 'What we buy'. Supporting explanation
    # remains below for visitors who want more detail before deciding.
    portal_re = re.compile(
        r'(<link rel="stylesheet" href="/portal\.css">\s*)?'
        r'(<section class="quote seller-portal" id="sell-form">.*?</section>)',
        flags=re.DOTALL,
    )
    match = portal_re.search(html)
    how_marker = '<section id="how">'
    how_pos = html.find(how_marker)
    if match and how_pos != -1 and match.start() > how_pos:
        portal = match.group(0)
        html = html[:match.start()] + html[match.end():]
        how_pos = html.find(how_marker)
        html = html[:how_pos] + portal + html[how_pos:]

    path.write_text(html, encoding="utf-8")
    print("patched: seller conversion flow")


def patch_services_page() -> None:
    path = ROOT / "services.html"
    html = path.read_text(encoding="utf-8")

    html = html.replace(
        "<h1 style=\"font-size:clamp(2.2rem,6vw,3.9rem)\">We also <em>offer</em></h1>",
        "<h1 style=\"font-size:clamp(2.2rem,6vw,3.9rem)\">Controls engineering &amp; <em>technical support</em></h1>",
    )
    html = html.replace(
        "Beyond buying and selling, we put 10+ years of factory-floor controls experience to work for UK manufacturers, machine builders and maintenance teams.",
        "PLC/HMI programming, remote fault-finding, control panel work and fixed-scope technical reports for UK manufacturers, machine builders and maintenance teams.",
        1,
    )

    # The generator adds a second three-card summary after the full services block.
    # Remove it so visitors see each service once rather than reading duplicates.
    duplicate_cards = re.compile(
        r'<section style="padding:2\.8rem 0"><div class="wrap"><div class="paths" style="margin:0">'
        r'.*?</section>',
        flags=re.DOTALL,
    )
    html = duplicate_cards.sub("", html, count=1)

    path.write_text(html, encoding="utf-8")
    print("patched: services conversion flow")


def patch_deal_desk_labels() -> None:
    js_path = ROOT / "deal-desk.js"
    if js_path.exists():
        text = js_path.read_text(encoding="utf-8")
        text = text.replace(
            '  "revenue-share": "Revenue share",\n};',
            '  "revenue-share": "Managed consignment",\n  brokerage: "Brokerage",\n};',
        )
        js_path.write_text(text, encoding="utf-8")

    html_path = ROOT / "deal-desk.html"
    if html_path.exists():
        text = html_path.read_text(encoding="utf-8")
        text = text.replace(
            '<option value="revenue-share">Revenue share</option>',
            '<option value="revenue-share">Managed consignment</option>\n            <option value="brokerage">Brokerage</option>',
        )
        html_path.write_text(text, encoding="utf-8")

    api_path = ROOT / "api" / "deal-desk.mjs"
    if api_path.exists():
        text = api_path.read_text(encoding="utf-8")
        text = text.replace(
            '    "revenue-share": "Revenue share / consignment",\n    "best-option": "Best route requested",',
            '    "revenue-share": "Managed resale / consignment",\n    brokerage: "Brokerage / find a buyer",\n    "best-option": "Best route requested",',
        )
        api_path.write_text(text, encoding="utf-8")

    print("patched: deal desk seller route labels")


def main() -> None:
    patch_sell_page()
    patch_services_page()
    patch_deal_desk_labels()


if __name__ == "__main__":
    main()

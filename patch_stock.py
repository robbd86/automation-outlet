#!/usr/bin/env python3
"""Inject the dynamic stock catalogue and stock-manager extras."""

from pathlib import Path

ROOT = Path(__file__).resolve().parent
BUY_PAGE = ROOT / "buy-stock.html"
ADMIN_PAGE = ROOT / "stock-admin.html"
CATALOGUE = ROOT / "_blocks" / "stock_catalogue.html"
CATALOGUE_JS = ROOT / "_blocks" / "stock_catalogue_js.html"


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if old not in text:
        raise RuntimeError(f"Could not find {label} while patching buy-stock.html")
    return text.replace(old, new, 1)


def patch_buy_page() -> None:
    html = BUY_PAGE.read_text(encoding="utf-8")
    catalogue = CATALOGUE.read_text(encoding="utf-8")
    catalogue_js = CATALOGUE_JS.read_text(encoding="utf-8")

    old_ctas = (
        '<div class="hero-ctas"><a href="https://www.ebay.co.uk" class="btn big" '
        'target=_blank rel=noopener>View stock on eBay</a><a '
        'href="/obsolete-parts-sourcing.html" class="btn big ghost">'
        'Ask us to source a part</a></div>'
    )
    new_ctas = (
        '<div class="hero-ctas"><a href="#stock" class="btn big">'
        'Browse current stock</a><a href="/obsolete-parts-sourcing.html" '
        'class="btn big ghost">Ask us to source a part</a></div>'
    )
    html = replace_once(html, old_ctas, new_ctas, "buy-page hero buttons")

    old_intro = (
        "Every PLC, HMI and drive we sell is powered up and function-tested by a "
        "controls engineer before it's listed &mdash; so you know what you're getting. "
        "Obsolete and hard-to-find parts a speciality."
    )
    new_intro = (
        "Browse PLCs, HMIs, drives and industrial automation spares currently available. "
        "Every listing states exactly what has been tested, the condition and what is included."
    )
    html = replace_once(html, old_intro, new_intro, "buy-page introduction")

    section_needle = '</div><section style="padding:3.2rem 0">'
    section_replacement = f'</div>{catalogue}<section style="padding:3.2rem 0">'
    html = replace_once(html, section_needle, section_replacement, "stock catalogue insertion point")

    script_needle = 'const FORM_ENDPOINT = "https://formspree.io/f/xqevvvll";\n'
    script_replacement = f'{script_needle}\n{catalogue_js}\n'
    html = replace_once(html, script_needle, script_replacement, "stock catalogue script insertion point")

    BUY_PAGE.write_text(html, encoding="utf-8")
    print("patched: buy-stock.html")


def patch_admin_page() -> None:
    html = ADMIN_PAGE.read_text(encoding="utf-8")
    delete_script = '<script src="/stock-delete.js"></script>'
    if delete_script not in html:
        admin_script = '<script src="/stock-admin.js"></script>'
        if admin_script not in html:
            raise RuntimeError("Could not find stock-admin.js while patching stock-admin.html")
        html = html.replace(admin_script, f'{admin_script}\n{delete_script}', 1)
        ADMIN_PAGE.write_text(html, encoding="utf-8")
    print("patched: stock-admin.html")


def main() -> None:
    patch_buy_page()
    patch_admin_page()


if __name__ == "__main__":
    main()

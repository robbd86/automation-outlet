#!/usr/bin/env python3
"""Final production cleanup after the normal site generator runs."""

from __future__ import annotations

import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent
ADMIN_PAGES = {"deal-desk.html", "stock-admin.html"}
ROBOTS_META = re.compile(r'\s*<meta\s+name=["\']robots["\'][^>]*>\s*(?:<!--\s*REMOVE AT LAUNCH\s*-->)?', re.I)
PRIVACY_FOOTER = (
    '<div class="wrap" style="padding-top:.7rem;padding-bottom:1rem;font-size:.82rem;'
    'color:var(--grey)"><a href="/privacy.html">Privacy notice</a></div>'
)


def clean_html() -> None:
    for path in ROOT.glob("*.html"):
        text = path.read_text(encoding="utf-8")
        if path.name in ADMIN_PAGES:
            if not re.search(r'<meta\s+name=["\']robots["\']', text, re.I):
                text = text.replace(
                    '<meta name="viewport" content="width=device-width, initial-scale=1.0">',
                    '<meta name="viewport" content="width=device-width, initial-scale=1.0">\n'
                    '<meta name="robots" content="noindex, nofollow">',
                    1,
                )
        else:
            text = ROBOTS_META.sub("\n", text)
            if path.name != "privacy.html" and '/privacy.html">Privacy' not in text and "</footer>" in text:
                text = text.replace("</footer>", PRIVACY_FOOTER + "\n</footer>", 1)
        path.write_text(text, encoding="utf-8")


def update_sitemap() -> None:
    path = ROOT / "sitemap.xml"
    if not path.exists():
        return
    text = path.read_text(encoding="utf-8")
    if "/privacy.html" not in text:
        text = text.replace(
            "</urlset>",
            '  <url><loc>https://www.automation-outlet.co.uk/privacy.html</loc><changefreq>yearly</changefreq><priority>0.4</priority></url>\n</urlset>',
        )
        path.write_text(text, encoding="utf-8")


def main() -> None:
    clean_html()
    update_sitemap()
    print("production cleanup complete")


if __name__ == "__main__":
    main()

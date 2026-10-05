#!/usr/bin/env python3
"""Final production cleanup after the normal site generator runs."""

from __future__ import annotations

import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent

# Private operational pages must never be indexed or included in the public sitemap.
# Any future *-admin.html page is private automatically; desk pages are explicit because
# they do not use the admin filename suffix.
PRIVATE_PAGES = {"agent-desk.html", "deal-desk.html"}
ROBOTS_META = re.compile(
    r'\s*<meta\s+name=["\']robots["\'][^>]*>\s*(?:<!--\s*REMOVE AT LAUNCH\s*-->)?',
    re.I,
)
POLICY_FOOTER = (
    '<div class="wrap" style="padding-top:.7rem;padding-bottom:1rem;font-size:.82rem;'
    'color:var(--grey)"><a href="/returns.html">Returns &amp; refunds</a> &middot; '
    '<a href="/privacy.html">Privacy notice</a></div>'
)


def is_private_page(name: str) -> bool:
    return name in PRIVATE_PAGES or name.endswith("-admin.html")


def force_noindex(text: str, page_name: str) -> str:
    """Ensure a private page has exactly one noindex/nofollow robots directive."""
    text = ROBOTS_META.sub("\n", text)
    text, count = re.subn(
        r"</head>",
        '  <meta name="robots" content="noindex, nofollow">\n</head>',
        text,
        count=1,
        flags=re.I,
    )
    if count != 1:
        raise RuntimeError(f"Could not add noindex to private page: {page_name}")
    return text


def clean_html() -> None:
    for path in ROOT.glob("*.html"):
        text = path.read_text(encoding="utf-8")
        if is_private_page(path.name):
            text = force_noindex(text, path.name)
        else:
            text = ROBOTS_META.sub("\n", text)
            if (
                path.name not in {"privacy.html", "returns.html"}
                and '/returns.html">Returns' not in text
                and "</footer>" in text
            ):
                text = text.replace("</footer>", POLICY_FOOTER + "\n</footer>", 1)
        path.write_text(text, encoding="utf-8")


def update_sitemap() -> None:
    # Generate from public pages only. Private/admin pages are denied by classification,
    # not by a fragile hand-maintained list of individual admin filenames.
    urls = []
    for page in sorted(ROOT.glob("*.html")):
        if is_private_page(page.name):
            continue
        text = page.read_text(encoding="utf-8")
        if re.search(r'<meta\s+name=["\']robots["\'][^>]*noindex', text, re.I):
            continue
        route = "" if page.name == "index.html" else page.name
        urls.append(f"  <url><loc>https://www.automation-outlet.co.uk/{route}</loc></url>")
    (ROOT / "sitemap.xml").write_text(
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
        + "\n".join(urls)
        + "\n</urlset>\n",
        encoding="utf-8",
    )


def main() -> None:
    clean_html()
    update_sitemap()
    print("production cleanup complete")


if __name__ == "__main__":
    main()

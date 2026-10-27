#!/usr/bin/env python3
"""Final production cleanup after the normal site generator runs."""

from __future__ import annotations

import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent

# Private operational/customer-session pages must never be indexed or included in
# the public sitemap. Any future *-admin.html page is private automatically.
PRIVATE_PAGES = {
    "agent-desk.html",
    "deal-desk.html",
    "plc-audit-upload.html",
    "plc-audit-dashboard.html",
    "plc-audit-audit.html",
    "cart.html",
    "order-success.html",
    "quick-check-unsubscribe.html",
}
# Manually maintained dates of substantive editorial review. Do not use build
# timestamps as lastmod: all generated HTML files are rewritten on every deploy.
EDITORIAL_LASTMOD = {
    "fault-powerflex-f010-f10-model-identification.html": "2026-10-27",
    "fault-powerflex-525-f002-auxiliary-input.html": "2026-10-27",
    "fault-powerflex-525-f003-power-loss.html": "2026-10-27",
    "fault-powerflex-525-f006-motor-stalled.html": "2026-10-27",
    "fault-powerflex-525-f007-motor-overload.html": "2026-10-27",
    "fault-powerflex-525-f008-heatsink-overtemperature.html": "2026-10-27",
    "fault-powerflex-525-f009-control-module-overtemperature.html": "2026-10-27",
    "fault-powerflex-525-f012-hardware-overcurrent.html": "2026-10-27",
    "fault-powerflex-525-f013-ground-fault.html": "2026-10-27",
    "fault-powerflex-525-f015-load-loss.html": "2026-10-27",
    "fault-powerflex-525-f021-output-phase-loss.html": "2026-10-27",
    "fault-powerflex-525-f029-analog-input-loss.html": "2026-10-27",
    "fault-powerflex-40-f3-excessive-dc-bus-ripple.html": "2026-10-27",
    "fault-powerflex-40-f4-undervoltage.html": "2026-10-27",
    "fault-powerflex-40-f6-motor-stalled.html": "2026-10-27",
    "fault-powerflex-40-f7-motor-overload.html": "2026-10-27",
    "fault-powerflex-40-f8-heatsink-overtemperature.html": "2026-10-27",
    "fault-powerflex-40-f12-hardware-overcurrent.html": "2026-10-27",
    "fault-powerflex-40-f13-ground-fault.html": "2026-10-27",
    "fault-powerflex-40-f29-analog-input-loss.html": "2026-10-27",
    "fault-finder.html": "2026-10-27",
    "fault-powerflex-40-f005-overvoltage.html": "2026-10-27",
    "fault-powerflex-525-f004-undervoltage.html": "2026-10-27",
    "fault-powerflex-525-f005-overvoltage.html": "2026-10-27",
    "fault-siemens-s7-300-sf-led.html": "2026-10-27",
    "fault-siemens-s7-300-bf-bus-fault.html": "2026-10-27",
    "fault-panelview-plus-blank-screen.html": "2026-10-27",
    "fault-slc-500-battery-low.html": "2026-10-27",
    "siemens-s7-300-cpu-replacement-checklist.html": "2026-10-18",
    "wire-label-generator.html": "2026-10-26",
    "engineering-toolbox.html": "2026-10-26",
    "plc-lifecycle.html": "2026-10-08",
    "factory-spares-network.html": "2026-10-08",
    "siemens-s7-300-discontinued.html": "2026-10-08",
    "mitsubishi-q-series-discontinued.html": "2026-10-08",
    "omron-cj2m-discontinued.html": "2026-10-08",
    "allen-bradley-slc-500-discontinued.html": "2026-10-08",
}

PUBLIC_ROUTE_OVERRIDES = {
    "plc-audit.html": "plc-audit",
}
ROBOTS_META = re.compile(
    r'\s*<meta\s+name=["\']robots["\'][^>]*>\s*(?:<!--\s*REMOVE AT LAUNCH\s*-->)?',
    re.I,
)
POLICY_FOOTER = (
    '<div class="wrap" style="padding-top:.7rem;padding-bottom:1rem;font-size:.82rem;'
    'color:var(--grey)"><a href="/returns.html">Returns &amp; refunds</a> &middot; '
    '<a href="/privacy.html">Privacy notice</a></div>'
)
LINKEDIN_URL = "https://www.linkedin.com/company/automation-outlet/"
LINKEDIN_FOOTER = "<div class=\"wrap ao-linkedin-footer\"><a class=\"ao-linkedin-link\" href=\"https://www.linkedin.com/company/automation-outlet/\" target=\"_blank\" rel=\"noopener noreferrer\" aria-label=\"Follow Automation Outlet on LinkedIn (opens in a new tab)\"><span class=\"ao-linkedin-icon\" aria-hidden=\"true\">in</span><span>Follow Automation Outlet on LinkedIn</span><span aria-hidden=\"true\">↗</span></a></div>"
LINKEDIN_HOME = "<section class=\"ao-linkedin-home\" aria-labelledby=\"ao-linkedin-heading\"><div class=\"wrap\"><div class=\"ao-linkedin-panel\"><div><span class=\"ao-linkedin-kicker\">Connect with Automation Outlet</span><h2 id=\"ao-linkedin-heading\">Follow our stock &amp; engineering updates</h2><p>See surplus automation stock, available spares and updates from the engineer-run business behind Automation Outlet.</p></div><a class=\"ao-linkedin-link ao-linkedin-cta\" href=\"https://www.linkedin.com/company/automation-outlet/\" target=\"_blank\" rel=\"noopener noreferrer\" aria-label=\"Visit Automation Outlet on LinkedIn (opens in a new tab)\"><span class=\"ao-linkedin-icon\" aria-hidden=\"true\">in</span><span>Visit our LinkedIn page</span><span aria-hidden=\"true\">↗</span></a></div></div></section>"


TOOLBOX_HOME = "<section id=\"ao-toolbox-home\" style=\"padding:2.8rem 0\"><div class=\"wrap\"><div class=\"paths\" style=\"margin:0;grid-template-columns:1fr\"><div class=\"path\"><div class=\"eyebrow\">Free resource for engineers</div><h3>AO Engineering <span>Toolbox</span></h3><p>Generate wire, terminal and PLC I/O labels from Excel or CSV. Free A4 printing; no account or spreadsheet upload required.</p><a class=\"link\" href=\"/engineering-toolbox.html\">Explore the free tools →</a> &nbsp; <a class=\"link\" href=\"/wire-label-generator.html\">Wire label generator →</a></div></div></div></section>"
TOOLBOX_SERVICES = "<section id=\"ao-toolbox-services\" style=\"padding:2.8rem 0\"><div class=\"wrap\"><div class=\"sec-head\"><h2>Free engineering <span>toolbox</span></h2><p>Use our free wire and PLC I/O label generator, including Excel imports and print-ready A4 labels.</p></div><a class=\"btn big\" href=\"/wire-label-generator.html\">Try the label generator</a> &nbsp; <a class=\"link\" href=\"/engineering-toolbox.html\">All engineering tools →</a></div></section>"
FAULT_FINDER_HOME = '<section id="ao-fault-finder-home" style="padding:2.7rem 0"><div class="wrap"><div class="paths" style="margin:0;grid-template-columns:1fr"><div class="path"><div class="eyebrow">Free engineering diagnostics</div><h3>AO <span>Fault Finder</span></h3><p>Search real PLC, drive and HMI fault codes, with model-specific checks and links to the official manuals. No login and no paywall.</p><a class="link" href="/fault-finder.html">Search the fault library &rarr;</a></div></div></div></section>'
FAULT_FINDER_TOOLBOX = '<section id="ao-fault-finder-toolbox" style="padding:2.6rem 0"><div class="wrap"><div class="paths" style="margin:0;grid-template-columns:1fr"><div class="path"><div class="eyebrow">Tool 02 / Free engineering help</div><h3>AO <span>Fault Finder</span></h3><p>Search PowerFlex F004 and F005, Siemens S7-300 system and bus faults, PanelView startup issues and SLC 500 battery warnings. Practical, manufacturer-referenced checks.</p><a class="link" href="/fault-finder.html">Open the fault finder &rarr;</a></div></div></div></section>'
FAULT_FINDER_FOOTER = '<div class="wrap" id="ao-fault-finder-footer" style="padding-top:.8rem;font-size:.88rem"><a href="/fault-finder.html">Free PLC, HMI &amp; drive fault finder</a></div>'

TOOLBOX_FOOTER = "<div class=\"wrap\" id=\"ao-toolbox-footer\" style=\"padding-top:1rem;font-size:.88rem\"><a href=\"/engineering-toolbox.html\">Free engineering tools</a> &middot; <a href=\"/wire-label-generator.html\">Wire label generator</a></div>"


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
        if not is_private_page(path.name):
            # Static pages are rebuilt on every deploy. Add the link to the
            # final HTML rather than a fragile intermediary template.
            if 'class="wrap ao-linkedin-footer"' not in text and "</footer>" in text:
                text = text.replace("</footer>", LINKEDIN_FOOTER + "\n</footer>", 1)
            if path.name == "index.html" and 'class="ao-linkedin-home"' not in text:
                if "</main>" not in text:
                    raise RuntimeError("Homepage main element not found for LinkedIn section")
                text = text.replace("</main>", LINKEDIN_HOME + "\n</main>", 1)
        if not is_private_page(path.name):
            if 'id="ao-toolbox-footer"' not in text and "</footer>" in text:
                text = text.replace("</footer>", TOOLBOX_FOOTER + "\n</footer>", 1)
            if path.name == "index.html" and 'id="ao-toolbox-home"' not in text:
                if "</main>" not in text:
                    raise RuntimeError("Homepage main element not found for toolbox section")
                text = text.replace("</main>", TOOLBOX_HOME + "\n</main>", 1)
            if path.name == "services.html" and 'id="ao-toolbox-services"' not in text:
                if "</main>" not in text:
                    raise RuntimeError("Services main element not found for toolbox section")
                text = text.replace("</main>", TOOLBOX_SERVICES + "\n</main>", 1)
            if 'id="ao-fault-finder-footer"' not in text and "</footer>" in text:
                text = text.replace("</footer>", FAULT_FINDER_FOOTER + "\n</footer>", 1)
            if path.name == "index.html" and 'id="ao-fault-finder-home"' not in text:
                if "</main>" not in text:
                    raise RuntimeError("Homepage main missing for Fault Finder")
                text = text.replace("</main>", FAULT_FINDER_HOME + "\n</main>", 1)
            if path.name == "engineering-toolbox.html" and 'id="ao-fault-finder-toolbox"' not in text:
                if "</main>" not in text:
                    raise RuntimeError("Engineering toolbox main missing for Fault Finder")
                text = text.replace("</main>", FAULT_FINDER_TOOLBOX + "\n</main>", 1)
        path.write_text(text, encoding="utf-8")


def public_route(page_name: str) -> str:
    if page_name == "index.html":
        return ""
    return PUBLIC_ROUTE_OVERRIDES.get(page_name, page_name)


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
        route = public_route(page.name)
        lastmod = EDITORIAL_LASTMOD.get(page.name)
        suffix = f"<lastmod>{lastmod}</lastmod>" if lastmod else ""
        urls.append(f"  <url><loc>https://www.automation-outlet.co.uk/{route}</loc>{suffix}</url>")
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
    # Run source-level SEO tests after generated pages and sitemap are final.
    import subprocess
    subprocess.run(["node", "--test", "tests/seo-guides.test.mjs", "tests/pilot-registration.test.mjs", "tests/obsolescence-check.test.mjs", "tests/quick-check-desk.test.mjs", "tests/quick-check-unsubscribe.test.mjs", "tests/quick-check-pilot.test.mjs", "tests/quick-check-research.test.mjs"], check=True)
    for script in ("obsolescence-check.js", "quick-check-admin.js"):
        subprocess.run(["node", "--check", script], check=True)


if __name__ == "__main__":
    main()

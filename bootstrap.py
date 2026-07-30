#!/usr/bin/env python3
"""Build the production-ready Automation Outlet site from the reviewed source bundle."""

from __future__ import annotations

import base64
import re
import shutil
import subprocess
import tarfile
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent
BUNDLE_DIR = ROOT / "bundle"
FORMSPREE_ENDPOINT = "https://formspree.io/f/xqevvvll"
ADMIN_PAGES = {"deal-desk.html", "stock-admin.html"}


def run(*args: str) -> None:
    subprocess.run(args, cwd=ROOT, check=True)


def extract_bundle() -> None:
    parts = sorted(BUNDLE_DIR.glob("part-*.b64"))
    if not parts:
        raise RuntimeError("No site bundle parts were found")

    encoded = "".join(part.read_text(encoding="ascii") for part in parts)
    archive_bytes = base64.b64decode("".join(encoded.split()), validate=True)

    with tempfile.NamedTemporaryFile(suffix=".tar.gz", delete=False) as tmp:
        tmp.write(archive_bytes)
        archive_path = Path(tmp.name)

    try:
        root_resolved = ROOT.resolve()
        with tarfile.open(archive_path, "r:gz") as archive:
            for member in archive.getmembers():
                if member.issym() or member.islnk():
                    raise RuntimeError(f"Refusing archive link: {member.name}")
                destination = (ROOT / member.name).resolve()
                if destination != root_resolved and root_resolved not in destination.parents:
                    raise RuntimeError(f"Unsafe archive path: {member.name}")
            archive.extractall(ROOT)
    finally:
        archive_path.unlink(missing_ok=True)

    # Export-only files are not part of the production site.
    (ROOT / ".github" / "workflows" / "export-site-bundle.yml").unlink(missing_ok=True)
    (ROOT / "site_bundle.b64").unlink(missing_ok=True)


def patch_contact_source() -> None:
    path = ROOT / "_blocks" / "quoteform.html"
    text = path.read_text(encoding="utf-8")

    text = text.replace(
        '<form id="quoteForm">',
        f'<form id="quoteForm" action="{FORMSPREE_ENDPOINT}" method="POST">\n'
        '      <input type="hidden" name="_subject" value="Automation Outlet — general enquiry">',
        1,
    )

    email_field = '''      <div class="field">
        <label for="email">Email</label>
        <input id="email" name="email" type="email" autocomplete="email" required>
      </div>
'''
    phone_marker = '      <div class="field">\n        <label for="phone">Phone</label>'
    if 'id="email"' not in text and phone_marker in text:
        text = text.replace(phone_marker, email_field + phone_marker, 1)

    text = text.replace(
        '<input id="phone" name="phone" type="tel" autocomplete="tel" required>',
        '<input id="phone" name="phone" type="tel" autocomplete="tel">',
        1,
    )
    text = text.replace('<label for="phone">Phone</label>', '<label for="phone">Phone (optional)</label>', 1)

    privacy_note = (
        '      <p class="form-note">By submitting this form, you agree that Automation Outlet may use '
        'your details to respond to your enquiry. See our <a href="/privacy.html">privacy notice</a>.</p>\n'
    )
    submit_marker = '      <button type="submit" class="btn big">Send for a quote</button>'
    if '/privacy.html' not in text and submit_marker in text:
        text = text.replace(submit_marker, privacy_note + submit_marker, 1)

    path.write_text(text, encoding="utf-8")


def build_site() -> None:
    run("python3", "build.py")
    run("python3", "patch_stock.py")


def privacy_page() -> str:
    return '''<!DOCTYPE html>
<html lang="en-GB">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Privacy Notice | Automation Outlet</title>
<meta name="description" content="How Automation Outlet uses and protects information submitted through our website.">
<link rel="canonical" href="https://www.automation-outlet.co.uk/privacy.html">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@600;700;800&family=Barlow:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/styles.css">
</head>
<body>
<header>
  <div class="wrap nav">
    <a href="/" class="logo"><span class="gear">&#9881;</span>Automation <span>Outlet</span></a>
    <nav class="nav-links">
      <a href="/sell-surplus.html">Sell to us</a>
      <a href="/buy-stock.html">Buy stock</a>
      <a href="/obsolete-parts-sourcing.html">Obsolete parts</a>
      <a href="/services.html">Services</a>
      <a href="/contact.html">Contact</a>
      <a href="/sell-surplus.html" class="btn">Get a quote</a>
    </nav>
  </div>
</header>
<main>
  <div class="hero" style="padding:3.8rem 0 3.2rem">
    <div class="wrap">
      <div class="eyebrow">Automation Outlet · Privacy</div>
      <h1 style="font-size:clamp(2.2rem,6vw,3.9rem)">Privacy <em>notice</em></h1>
      <p>This notice explains what information we collect through this website, why we use it and how to contact us about it.</p>
    </div>
  </div>
  <section style="padding:3rem 0">
    <div class="wrap" style="max-width:850px">
      <div class="sec-head"><h2>Information we <span>collect</span></h2></div>
      <p style="color:var(--grey);margin-bottom:1rem">When you contact us, request a quote, offer equipment for sale or ask about a part, we may collect your name, company, email address, telephone number, location and the information you provide about the equipment or service.</p>
      <p style="color:var(--grey);margin-bottom:1rem">We use this information to respond, prepare quotations, assess equipment, arrange collection or delivery, manage enquiries and keep reasonable business records.</p>

      <div class="sec-head" style="margin-top:2.4rem"><h2>Services and <span>storage</span></h2></div>
      <p style="color:var(--grey);margin-bottom:1rem">Form submissions may be processed by Formspree. Structured seller enquiries and stock-management records may be stored as private records in GitHub and processed through Vercel-hosted website functions. These services act as technology providers supporting the website.</p>
      <p style="color:var(--grey);margin-bottom:1rem">We do not sell personal information. We keep information only for as long as reasonably needed to handle the enquiry, complete a transaction, meet legal or accounting requirements, or maintain relevant business records.</p>

      <div class="sec-head" style="margin-top:2.4rem"><h2>Your <span>choices</span></h2></div>
      <p style="color:var(--grey);margin-bottom:1rem">You may ask what personal information we hold about you, request correction, or ask us to delete information where we no longer need to retain it.</p>
      <p style="color:var(--grey);margin-bottom:1rem">Contact: <a href="mailto:info@automation-outlet.co.uk">info@automation-outlet.co.uk</a> or WhatsApp <a href="https://wa.me/447849506371">07849 506371</a>.</p>
      <p style="color:var(--grey);font-size:.9rem;margin-top:2rem">Last updated: 30 July 2026.</p>
    </div>
  </section>
</main>
<footer>
  <div class="wrap foot">
    <div>
      <div class="logo"><span class="gear">&#9881;</span>Automation <span>Outlet</span></div>
      <p style="margin-top:.5rem">Industrial automation solutions · Cambridgeshire, UK</p>
      <p style="margin-top:.6rem"><a href="mailto:info@automation-outlet.co.uk">info@automation-outlet.co.uk</a> · <a href="/privacy.html">Privacy</a></p>
    </div>
  </div>
</footer>
</body>
</html>
'''


def clean_public_pages() -> None:
    robots_meta = re.compile(r'\s*<meta\s+name=["\']robots["\'][^>]*>\s*(?:<!--\s*REMOVE AT LAUNCH\s*-->)?', re.I)
    privacy_footer = (
        '<div class="wrap" style="padding-top:.7rem;padding-bottom:1rem;font-size:.82rem;'
        'color:var(--grey)"><a href="/privacy.html">Privacy notice</a></div>'
    )

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
            text = robots_meta.sub("\n", text)
            if path.name != "privacy.html" and '/privacy.html">Privacy' not in text and "</footer>" in text:
                text = text.replace("</footer>", privacy_footer + "\n</footer>", 1)
        path.write_text(text, encoding="utf-8")


def update_sitemap() -> None:
    path = ROOT / "sitemap.xml"
    if not path.exists():
        return
    text = path.read_text(encoding="utf-8")
    if "/privacy.html" not in text:
        entry = '  <url><loc>https://www.automation-outlet.co.uk/privacy.html</loc><changefreq>yearly</changefreq><priority>0.4</priority></url>\n'
        text = text.replace("</urlset>", entry + "</urlset>")
        path.write_text(text, encoding="utf-8")


def remove_build_only_files() -> None:
    for relative in ("bundle", "_blocks", "tests", "docs", ".github"):
        path = ROOT / relative
        if path.exists():
            shutil.rmtree(path)
    for relative in ("build.py", "patch_stock.py", "site_bundle.b64"):
        (ROOT / relative).unlink(missing_ok=True)

    # Preserve the repository's build configuration in the deployment output.
    (ROOT / "vercel.json").write_text(
        '{\n  "framework": null,\n  "buildCommand": "python3 bootstrap.py",\n  "outputDirectory": "."\n}\n',
        encoding="utf-8",
    )


def main() -> None:
    extract_bundle()
    patch_contact_source()
    build_site()
    (ROOT / "privacy.html").write_text(privacy_page(), encoding="utf-8")
    clean_public_pages()
    update_sitemap()
    remove_build_only_files()
    print("Production site prepared successfully")


if __name__ == "__main__":
    main()

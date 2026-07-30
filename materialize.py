#!/usr/bin/env python3
"""One-time migration: unpack the reviewed site into this repository and prepare it for production."""

from __future__ import annotations

import shutil
import subprocess
from pathlib import Path

import bootstrap

ROOT = Path(__file__).resolve().parent

RELEASE_SCRIPT = r'''#!/usr/bin/env python3
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
'''


def run(*args: str) -> None:
    subprocess.run(args, cwd=ROOT, check=True)


def patch_source() -> None:
    bootstrap.patch_contact_source()

    build_path = ROOT / "build.py"
    build = build_path.read_text(encoding="utf-8")
    build = build.replace(
        "NOINDEX = '<meta name=\"robots\" content=\"noindex, nofollow\"><!-- REMOVE AT LAUNCH -->'",
        "NOINDEX = ''",
        1,
    )
    if '("Privacy notice", "/privacy.html")' not in build:
        build = build.replace(
            '    ("Bench testing", "/bench-testing.html"),\n]',
            '    ("Bench testing", "/bench-testing.html"),\n    ("Privacy notice", "/privacy.html"),\n]',
            1,
        )
    build_path.write_text(build, encoding="utf-8")

    (ROOT / "privacy.html").write_text(bootstrap.privacy_page(), encoding="utf-8")
    (ROOT / "release.py").write_text(RELEASE_SCRIPT, encoding="utf-8")
    (ROOT / "vercel.json").write_text(
        '{\n  "framework": null,\n  "buildCommand": "python3 build.py && python3 patch_stock.py && python3 release.py",\n  "outputDirectory": "."\n}\n',
        encoding="utf-8",
    )

    # The migration token cannot create workflow files. Production validation is
    # handled before the commit and Vercel will validate the preview deployment.
    (ROOT / ".github" / "workflows" / "site.yml").unlink(missing_ok=True)
    (ROOT / ".github" / "workflows" / "export-site-bundle.yml").unlink(missing_ok=True)

    readme = ROOT / "README.md"
    existing = readme.read_text(encoding="utf-8") if readme.exists() else ""
    production_note = '''

## Production repository

This repository now contains the production Automation Outlet website, including:

- public multi-page website and SEO pages
- Formspree-backed general and fallback enquiries
- structured seller portal and private deal desk
- public stock catalogue and private stock manager
- Vercel serverless API functions

Vercel builds with `python3 build.py && python3 patch_stock.py && python3 release.py`.

Required Vercel environment variables:

- `AO_GITHUB_TOKEN`
- `AO_DEAL_DESK_KEY`
- `AO_GITHUB_REPO=robbd86/automation-outlet-site`

The private repository remains the data store for stock and seller records. Never commit tokens or passwords.
'''
    if "## Production repository" not in existing:
        readme.write_text(existing.rstrip() + production_note, encoding="utf-8")


def remove_migration_files() -> None:
    for relative in (
        "bundle",
        "bootstrap.py",
        "materialize.py",
        "middleware.js",
        "package.json",
        "site_bundle.b64",
        "__pycache__",
    ):
        path = ROOT / relative
        if path.is_dir():
            shutil.rmtree(path)
        else:
            path.unlink(missing_ok=True)


def main() -> None:
    bootstrap.extract_bundle()
    patch_source()
    run("python3", "build.py")
    run("python3", "patch_stock.py")
    run("python3", "release.py")
    remove_migration_files()
    print("Repository materialised and validated")


if __name__ == "__main__":
    main()

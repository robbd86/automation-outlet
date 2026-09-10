#!/usr/bin/env python3
"""Serve the approved AO logo as a normal static image with a safe fallback."""
from pathlib import Path
import ast
import base64

ROOT = Path(__file__).resolve().parent
SOURCE = ROOT / "patch_exact_logo.py"
OUTPUT = ROOT / "ao-approved-logo.webp"
PREFIX = "data:image/webp;base64,"
FALLBACK = "/ao-site-logo.svg"

source_text = SOURCE.read_text(encoding="utf-8")
tree = ast.parse(source_text)
logo_data = None

for node in tree.body:
    if isinstance(node, ast.Assign):
        if any(isinstance(target, ast.Name) and target.id == "LOGO" for target in node.targets):
            logo_data = ast.literal_eval(node.value)
            break

replacement = FALLBACK
if isinstance(logo_data, str) and logo_data.startswith(PREFIX):
    try:
        payload = base64.b64decode(logo_data[len(PREFIX):])
        if len(payload) < 16 or payload[:4] != b"RIFF" or payload[8:12] != b"WEBP":
            raise ValueError("decoded logo is not a valid WebP container")
        OUTPUT.write_bytes(payload)
        replacement = "/ao-approved-logo.webp"
        print(f"Wrote approved logo to {OUTPUT.name}")
    except Exception as exc:
        print(f"Approved logo extraction failed ({exc}); using {FALLBACK}")
else:
    print(f"Approved logo data not found; using {FALLBACK}")

changed = 0
if isinstance(logo_data, str):
    for path in ROOT.glob("*.html"):
        text = path.read_text(encoding="utf-8")
        updated = text.replace(logo_data, replacement)
        if updated != text:
            path.write_text(updated, encoding="utf-8")
            changed += 1

print(f"Updated {changed} HTML pages to use {replacement}")

# Keep the approved artwork inside the sticky header at every screen width.
css_path = ROOT / "styles.css"
css_text = css_path.read_text(encoding="utf-8")
marker = "/* AO HEADER SPACING */"
css_text = css_text.split(marker)[0].rstrip()
css_path.write_text(css_text + "\n/* AO HEADER SPACING */\nheader{background:var(--navy-deep)}\nheader .nav{height:auto;min-height:82px;gap:32px;padding-top:10px;padding-bottom:10px}\nheader .logo.logo-image{min-width:0;flex:0 1 280px}\nheader .logo.logo-image img{width:280px;max-width:100%;height:auto;max-height:62px;object-fit:contain}\nheader .nav-links{gap:18px;flex-shrink:0}\nheader .nav-links a{white-space:nowrap}\nheader .nav-toggle{flex-shrink:0;min-width:44px;min-height:44px;align-items:center;justify-content:center}\n@media(max-width:1119px){\n  header .nav-links{display:none}\n  header .nav-toggle{display:flex}\n}\n@media(min-width:1120px){\n  header .mobile-menu{display:none}\n}\n@media(max-width:640px){\n  header .nav{min-height:72px;gap:20px;padding-top:8px;padding-bottom:8px}\n  header .logo.logo-image{flex-basis:260px}\n  header .logo.logo-image img{width:260px;max-height:56px}\n}\nheader .mobile-menu{max-height:calc(100dvh - 82px);overflow-y:auto}\n" + "\n", encoding="utf-8")

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

#!/usr/bin/env python3
"""Convert the approved embedded AO logo into a normal static asset.

The previous build embedded a very large WebP data URI directly in every logo
<img>. Some mobile browsers render that as a broken image. This step extracts
the exact approved artwork, writes it as /ao-approved-logo.webp and points the
header/footer logos at the static file instead.
"""
from pathlib import Path
import ast
import base64

ROOT = Path(__file__).resolve().parent
SOURCE = ROOT / "patch_exact_logo.py"
OUTPUT = ROOT / "ao-approved-logo.webp"
PREFIX = "data:image/webp;base64,"

source_text = SOURCE.read_text(encoding="utf-8")
tree = ast.parse(source_text)
logo_data = None

for node in tree.body:
    if isinstance(node, ast.Assign):
        if any(isinstance(target, ast.Name) and target.id == "LOGO" for target in node.targets):
            logo_data = ast.literal_eval(node.value)
            break

if not isinstance(logo_data, str) or not logo_data.startswith(PREFIX):
    raise RuntimeError("Could not find approved WebP logo data in patch_exact_logo.py")

payload = logo_data[len(PREFIX):]
OUTPUT.write_bytes(base64.b64decode(payload, validate=True))

changed = 0
for path in ROOT.glob("*.html"):
    text = path.read_text(encoding="utf-8")
    updated = text.replace(logo_data, "/ao-approved-logo.webp")
    if updated != text:
        path.write_text(updated, encoding="utf-8")
        changed += 1

print(f"Wrote {OUTPUT.name} and updated {changed} HTML pages")

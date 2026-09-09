#!/usr/bin/env python3
"""Replace the text AO logo with the branded image logo on all generated pages."""
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parent

HEADER_LOGO = (
    '<a href="/" class="logo logo-image" aria-label="Automation Outlet home">'
    '<img src="/ao-site-logo.svg" alt="Automation Outlet">'
    '</a>'
)
FOOTER_LOGO = (
    '<div class="logo logo-image footer-logo">'
    '<img src="/ao-site-logo.svg" alt="Automation Outlet">'
    '</div>'
)

header_pattern = re.compile(
    r'<a\s+href="/"\s+class="logo">\s*<span\s+class="gear">&#9881;</span>\s*Automation\s*<span>Outlet</span>\s*</a>',
    re.I,
)
footer_pattern = re.compile(
    r'<div\s+class="logo">\s*<span\s+class="gear">&#9881;</span>\s*Automation\s*<span>Outlet</span>\s*</div>',
    re.I,
)

changed = 0
for path in ROOT.glob('*.html'):
    text = path.read_text(encoding='utf-8')
    updated = header_pattern.sub(HEADER_LOGO, text)
    updated = footer_pattern.sub(FOOTER_LOGO, updated)
    if updated != text:
        path.write_text(updated, encoding='utf-8')
        changed += 1

css_path = ROOT / 'styles.css'
css = css_path.read_text(encoding='utf-8')
marker = '/* AO BRANDED IMAGE LOGO */'
if marker not in css:
    css += r'''

/* AO BRANDED IMAGE LOGO */
.logo.logo-image{
  display:flex;
  align-items:center;
  flex-shrink:0;
  font-size:0;
  line-height:0;
  text-transform:none;
}
.logo.logo-image img{
  display:block;
  width:248px;
  height:auto;
  border-radius:7px;
  box-shadow:0 0 0 1px rgba(77,148,255,.16),0 8px 24px rgba(0,0,0,.18);
}
footer .logo.logo-image img{
  width:310px;
  max-width:100%;
}
@media(max-width:720px){
  .logo.logo-image img{width:220px}
}
@media(max-width:390px){
  .logo.logo-image img{width:196px}
}
'''
    css_path.write_text(css, encoding='utf-8')

print(f'Applied AO branded logo to {changed} HTML pages')

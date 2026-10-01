#!/usr/bin/env python3
"""Add cumulative consignment proof to the public AO homepage and consignment page.

This runs after build.py so the trust messaging survives future rebuilds.
"""

from pathlib import Path

HOME_BLOCK = f'''
<!-- AO_CONSIGNMENT_TRUST_START -->
<section id="consignment-proof" style="padding:0 0 2.4rem">
  <div class="wrap">
    <div class="trust">
      <div>
        <h4>Successful consignment sales completed</h4>
        <p>Proven managed-resale transactions completed for automation sellers.</p>
      </div>
      <div>
        <h4>Seller-held stock</h4>
        <p>Suitable equipment can remain with you until a buyer is secured.</p>
      </div>
      <div>
        <h4>80% standard seller share</h4>
        <p>Our standard consignment split gives the seller 80% of net sale proceeds.</p>
      </div>
      <div>
        <h4>No upfront commission</h4>
        <p>AO earns its agreed share when an item sells.</p>
      </div>
    </div>
    <p class="services-note" style="margin-top:1rem">
      <strong>Proven managed-resale track record</strong>
      &nbsp;&middot;&nbsp; <a href="/consignment.html">See how consignment works &rarr;</a>
    </p>
  </div>
</section>
<!-- AO_CONSIGNMENT_TRUST_END -->
'''

CONSIGNMENT_BLOCK = f'''
<!-- AO_CONSIGNMENT_TRUST_START -->
<section id="consignment-results" style="padding:0 0 2.8rem">
  <div class="wrap">
    <div class="sec-head">
      <div class="eyebrow">Proven managed resale</div>
      <h2>Successful <span>consignment sales completed</span></h2>
      <p>Real surplus automation equipment marketed, sold and settled through Automation Outlet's managed-resale service.</p>
    </div>
    <div class="trust">
      <div>
        <h4>Stock stays with the seller</h4>
        <p>Suitable seller-held stock does not need to be transferred to AO before a buyer is found.</p>
      </div>
      <div>
        <h4>AO handles the sale</h4>
        <p>We market the equipment, handle buyer enquiries and negotiate the transaction.</p>
      </div>
      <div>
        <h4>Clear commercial terms</h4>
        <p>Our standard arrangement gives the seller 80% of net sale proceeds and AO 20%.</p>
      </div>
      <div>
        <h4>Buyer and seller privacy</h4>
        <p>Public case studies do not disclose consignor or buyer identities without permission.</p>
      </div>
    </div>
    <p class="services-note" style="margin-top:1rem">Completed seller transactions through Automation Outlet. Results vary by part number, condition, demand and price.</p>
  </div>
</section>
<!-- AO_CONSIGNMENT_TRUST_END -->
'''


def remove_existing(html: str) -> str:
    start_marker = "<!-- AO_CONSIGNMENT_TRUST_START -->"
    end_marker = "<!-- AO_CONSIGNMENT_TRUST_END -->"
    while start_marker in html and end_marker in html:
        start = html.index(start_marker)
        end = html.index(end_marker, start) + len(end_marker)
        html = html[:start] + html[end:]
    return html


def insert_before_first_section(path: Path, block: str) -> None:
    html = remove_existing(path.read_text(encoding="utf-8"))
    main_pos = html.find("<main>")
    if main_pos < 0:
        raise RuntimeError(f"<main> not found in {path}")
    section_pos = html.find("<section", main_pos)
    if section_pos < 0:
        raise RuntimeError(f"first <section> not found in {path}")
    html = html[:section_pos] + block + html[section_pos:]
    path.write_text(html, encoding="utf-8")


insert_before_first_section(Path("index.html"), HOME_BLOCK)
insert_before_first_section(Path("consignment.html"), CONSIGNMENT_BLOCK)

print("patched consignment trust proof into index.html and consignment.html")

#!/usr/bin/env python3
"""Link the first AO organic growth resources into high-intent existing pages.

Run after all existing patches and before release.py. No form or checkout logic changes.
"""
from pathlib import Path
ROOT = Path(__file__).resolve().parent

SELL_INSERT = """<section id="ao-seller-fast-route" style="padding:1.5rem 0 1rem">
<div class="wrap"><div class="path" style="max-width:none;padding:1.3rem 1.6rem;border-left:4px solid #38a9ee">
<div class="eyebrow">A simpler first step</div>
<h3>Have a stock spreadsheet or a few clear photos?</h3>
<p>Send the manufacturer part numbers and quantities to start. You can use the detailed seller portal below, or WhatsApp photos first if that is easier. For immediate purchase enquiries, AO agrees terms before the stock moves; payment follows delivery and inspection.</p>
<a class="link" href="https://wa.me/447849506371?text=Hi%20AO%2C%20I%20have%20surplus%20automation%20equipment.%20Can%20I%20send%20photos%20or%20an%20inventory%3F">Send stock photos on WhatsApp &rarr;</a>
&nbsp; &nbsp; <a class="link" href="/sell-siemens-plc.html">Selling Siemens stock? &rarr;</a>
</div></div></section>"""

GUIDE_LINKS = """<section id="ao-fault-resource-links" style="padding:2.6rem 0">
<div class="wrap"><div class="sec-head"><h2>Free PLC <span>fault-finding resources</span></h2>
<p>Practical information first, with sourcing available if diagnostics confirm you need a replacement.</p></div>
<div class="paths" style="margin:0">
<div class="path"><div class="eyebrow">Troubleshooting</div><h3>Siemens S7-300 SF / BF fault</h3><p>Check LED indications, the diagnostic buffer and network evidence before replacing the CPU.</p><a class="link" href="/siemens-s7-300-sf-bf-fault.html">Read the diagnostic guide &rarr;</a></div>
<div class="path"><div class="eyebrow">Engineering knowledge</div><h3>PLC fault guides</h3><p>Free fault-finding information, a replacement checklist and engineering tools.</p><a class="link" href="/plc-fault-guides.html">Browse the resource hub &rarr;</a></div>
</div></div></section>"""

SELL_SIEMENS_LINK = """<section id="ao-siemens-seller-guide" style="padding:2rem 0">
<div class="wrap"><div class="path"><h3>Got Siemens S7-300, S7-400, HMI or SINAMICS spares?</h3>
<p>Read which order numbers and condition details make a useful trade or consignment enquiry.</p>
<a class="link" href="/sell-siemens-plc.html">Sell surplus Siemens equipment &rarr;</a></div></div></section>"""

def insert_before(path: str, marker: str, snippet: str, label: str) -> None:
    f=ROOT/path
    if not f.exists():
        raise RuntimeError("Missing site page: "+path)
    data=f.read_text(encoding="utf-8")
    if "id=\""+label+"\"" in data:
        return
    if marker not in data:
        raise RuntimeError("Cannot locate "+label+" insertion point in "+path)
    data=data.replace(marker,snippet+"\n"+marker,1)
    f.write_text(data,encoding="utf-8")

def main():
    insert_before("sell-surplus.html",'<section class="quote seller-portal" id="sell-form">',SELL_INSERT,"ao-seller-fast-route")
    insert_before("sell-surplus-plcs.html","</main>",SELL_SIEMENS_LINK,"ao-siemens-seller-guide")
    # This creates natural internal links without competing with the main enquiry forms.
    for name in ("index.html","engineering-toolbox.html","obsolete-parts-sourcing.html","source-siemens.html"):
        insert_before(name,"</main>",GUIDE_LINKS,"ao-fault-resource-links")
    # The existing sourcing and seller journeys remain untouched by this SEO link layer.
    print("AO audience growth: seller quick path and four guide link placements applied")

if __name__=="__main__":
    main()

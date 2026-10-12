#!/usr/bin/env python3
"""Buyer-first storefront enhancement. Runs after site generation and SEO patches.

Never publishes partner offers or invents inventory, pricing, supplier rights or review counts.
"""
from __future__ import annotations

import html as H
import json
import re
from pathlib import Path
from urllib.parse import quote

ROOT=Path(__file__).resolve().parent
BASE="https://www.automation-outlet.co.uk"
HUB="/source-parts.html"
SIEMENS="/source-siemens.html"
AB="/source-allen-bradley.html"

def quote_url(part: str = "") -> str:
    return "/obsolete-parts-sourcing.html" + ("?part=" + quote(part,safe="") if part else "") + "#find-part"

def section_header(kicker, heading, blurb):
    return (f'<div class="growth-section-header"><div><div class="growth-kicker">{kicker}</div>'
            f'<h2>{heading}</h2></div><p>{blurb}</p></div>')

def card(title, info, href, label, kicker="Sourcing enquiry"):
    return (f'<article class="growth-slab"><span class="growth-kicker">{kicker}</span>'
            f'<h3>{title}</h3><p>{info}</p><a class="growth-link" href="{H.escape(href,quote=True)}">'
            f'{label} &rarr;</a></article>')

def breadcrumb(parts):
    links=['<a href="/">Home</a>']
    for label, url in parts[:-1]:
        links.append(f'<a href="{url}">{H.escape(label)}</a>')
    links.append(H.escape(parts[-1][0]))
    return '<nav class="growth-breadcrumb" aria-label="Breadcrumb">' + ' / '.join(links) + '</nav>'

def hero(crumb, kicker, headline, copy, route_label="Request sourcing quotation"):
    return (f'<section class="growth-hero"><div class="growth-wrap">'
            f'{breadcrumb(crumb)}<div class="growth-kicker">{kicker}</div>'
            f'<h1>{headline}</h1><p class="growth-lead" style="margin-top:18px">{copy}</p>'
            f'<div class="growth-actions"><a class="growth-btn" href="{quote_url()}">{route_label} &rarr;</a>'
            f'<a class="growth-btn outline" href="/buy-stock.html">Browse current AO stock</a></div></div></section>')

def note():
    return ('<p class="growth-clarity"><strong>Availability transparency:</strong> A part number shown in this '
            'sourcing directory is a reference for enquiries, <strong>not a stock or price offer</strong>. '
            'AO checks each source, unit condition, quantity, delivery date and terms before making a quotation.</p>')

def stock_examples(items):
    blocks=[]
    for part, family, description in items:
        blocks.append(
            '<article class="growth-slab growth-example">'
            f'<span class="growth-tag">{H.escape(family)}</span>'
            f'<strong class="growth-part">{H.escape(part)}</strong>'
            f'<p>{H.escape(description)}</p>'
            f'<a class="growth-link" href="{H.escape(quote_url(part),quote=True)}">Enquire about this part &rarr;</a>'
            '</article>')
    return '<div class="growth-examples">' + ''.join(blocks) + '</div>'

def hub_body():
    b=hero([("Sourcing directory",HUB)],
      "Industrial automation sourcing / UK",
      'A parts directory built around <span class="growth-highlight">real enquiries.</span>',
      "Browse the equipment families we can investigate through our own listed stock and independent sourcing channels. We do not imply these parts are currently held, supplier-backed or ready to ship.")
    b+='<section><div class="growth-wrap">'+section_header("Start here", "Search by exact <span class=\"growth-highlight\">part number.</span>", "Manufacturer order numbers help avoid quoting the wrong revision, processor, I/O or drive variant.")
    b+=(f'<form class="growth-lookup" action="/obsolete-parts-sourcing.html#find-part" method="get" role="search">'
        '<label for="hubPart" class="sr-only" style="position:absolute;clip:rect(0,0,0,0)">Manufacturer part number</label>'
        '<input id="hubPart" name="part" placeholder="e.g. 1756-L71 or 6ES7315-2AG10-0AB0" '
        'type="search" autocomplete="off" maxlength="100" required><button class="growth-btn" type="submit">Request a quote &rarr;</button></form>')
    b+='<div style="margin-top:27px">'+note()+'</div></div></section>'
    b+='<section class="growth-soft" id="other-brands"><div class="growth-wrap">'+section_header("Explore makes","Sourcing by manufacturer","Start with a recognised automation platform, then provide the exact order number and preferred condition.")
    b+='<div class="growth-grid-2">'
    b+=card("Siemens PLCs, drives &amp; HMIs","SIMATIC S7-300/400, HMI panels, SINAMICS and other Siemens industrial control components.",SIEMENS,"Siemens sourcing guide","SIEMENS")
    b+=card("Allen-Bradley &amp; Rockwell","ControlLogix, CompactLogix, SLC 500, PanelView, PowerFlex and associated control modules.",AB,"Allen-Bradley sourcing guide","ALLEN-BRADLEY")
    b+=card("Omron &amp; Mitsubishi","Legacy and current PLC families, selected I/O, power supplies and controllers. Provide your full factory order number.",quote_url(),"Send Omron or Mitsubishi enquiry","OTHER PLC MAKES")
    b+=card("Drives, safety &amp; other makes","ABB, Lenze, Control Techniques, Schneider and other identified industrial automation equipment.",quote_url(),"Enquire about other parts","DRIVES AND CONTROLS")
    b+='</div></div></section>'
    b+='<section><div class="growth-wrap">'+section_header("The process", "From part number <span class=\"growth-highlight\">to a real quotation.</span>", "A structured sourcing service rather than unverified catalogue claims.")
    b+='<div class="growth-how"><div><span>01 / IDENTIFY</span><h3>Send the full code</h3><p>Include quantity, target condition, machine urgency and a photo of the nameplate if available.</p></div><div><span>02 / VERIFY</span><h3>Check the source</h3><p>We investigate possible suppliers or AO stock, the revision, condition, delivery and test information.</p></div><div><span>03 / QUOTE</span><h3>Agree before ordering</h3><p>Where we can source a suitable unit, we confirm the commercial terms before you place an order.</p></div></div></div></section>'
    b+='<section class="growth-soft"><div class="growth-wrap">'+section_header("Common questions","Sourcing with clarity","Buying discontinued controls demands extra care.")
    b+='<div class="growth-faq">'
    for q,a in [
      ("Does an item listed here mean it is in stock?","No. These are reference examples and sourcing categories. For ready-to-buy AO stock, use our current stock listings."),
      ("Can you supply new or refurbished stock?","We can investigate different conditions; actual options depend on the individual source. We disclose the quoted unit's stated condition."),
      ("Will the replacement work in my machine?","Matching a part number is a first step, not a compatibility guarantee. Check revision, firmware, configuration, accessories and the original system."),
      ("Can you respond to an urgent breakdown?","Tell us if the machine is down and your required delivery date. We'll assess possible routes, without promising stock that isn't confirmed.")
    ]:b+=f'<article><h3>{H.escape(q)}</h3><p>{H.escape(a)}</p></article>'
    b+='</div></div></section>'
    b+='<section><div class="growth-wrap"><div class="growth-quote"><div><div class="growth-kicker">Talk to an engineer-led UK business</div><h2>Send the <span class="growth-highlight">exact part number.</span></h2><p>Start an enquiry today; supply is subject to confirmation.</p></div><a class="growth-btn" href="'+quote_url()+'">Request sourcing &rarr;</a></div></div></section>'
    return b

BRANDS={
 "siemens":{
  "label":"Siemens","path":"source-siemens.html",
  "title":"Siemens PLC, HMI & SINAMICS Spares Sourcing UK | Automation Outlet",
  "description":"Request sourcing for Siemens S7-300, S7-400, SIMATIC HMI and SINAMICS spares. UK engineer-led enquiries, exact part-number checks and confirmed quotation.",
  "intro":"We help UK maintenance teams investigate hard-to-find Siemens SIMATIC CPUs, modules, operator panels and drive equipment. Availability is verified for each exact order number before quoting.",
  "families":[
    ("SIMATIC S7-300","For legacy CPU and I/O replacements, check the complete 6ES7 reference, firmware, front-connector needs and module compatibility."),
    ("SIMATIC S7-400","For larger rack-based systems, confirm the CPU order number, communications requirements, memory and any redundant or safety configuration."),
    ("SIMATIC HMI","Panel size alone does not identify the replacement. Check the full 6AV reference, software project and available backup."),
    ("SINAMICS & legacy drives","A similar power rating does not guarantee a drop-in replacement. Confirm the complete 6SL number and application configuration.")
  ],
  "items":[
   ("6ES7315-2AG10-0AB0","S7-300 CPU","CPU 315-2 DP example. Confirm exact suffix, firmware and programme backup before ordering."),
   ("6ES7416-3ES06-0AB0","S7-400 CPU","CPU 416-3 PN/DP example. Identify memory, rack and communications requirements."),
   ("6ES7416-2XK02-0AB0","S7-400 CPU","CPU 416-2 reference. Verify the original unit's complete code and version."),
   ("6SL3210-1PE21-1UL0","SINAMICS drive","SINAMICS part-number example. Confirm rating, hardware version and installation details.")
  ],
  "faq":[("Is an S7-300 replacement always plug-and-play?","No. Verify exact order number, firmware, programme, memory card and communications setup. Physical fit alone is insufficient."),
         ("Can you source Siemens drives as well as PLCs?","Yes, we can investigate identified SINAMICS and older drive order numbers. Sourcing depends on actual availability."),
         ("Are these Siemens parts shown as in stock?","No. These pages describe possible sourcing enquiries. Only current AO product listings offer specific units for purchase.")],
  "guide":("/siemens-s7-300-discontinued.html","Read the Siemens S7-300 lifecycle guide")
 },
 "allen":{
  "label":"Allen-Bradley","path":"source-allen-bradley.html",
  "title":"Allen-Bradley PLC & PanelView Spares Sourcing UK | Automation Outlet",
  "description":"Source hard-to-find Allen-Bradley ControlLogix, SLC 500, PanelView and PowerFlex spares through Automation Outlet. UK enquiry-based quoting.",
  "intro":"Find a practical sourcing route for legacy Allen-Bradley processors, I/O, HMI and drive components. We verify the full catalogue number, condition and supplier details before quoting.",
  "families":[
   ("ControlLogix","Check the complete 1756 catalogue number, controller generation, communication modules and firmware before replacing a processor."),
   ("SLC 500","Legacy 1747 controllers and modules require careful matching of CPU type, rack, communications and backed-up programme."),
   ("PanelView & HMIs","Check the full 2711/2711P reference, screen type, communications and original HMI application."),
   ("PowerFlex drives","Verify complete 20/22/25-series catalogue codes, motor settings, network options and control interface.")
  ],
  "items":[
   ("1756-L71","ControlLogix","Logix controller example. Check firmware and slot/network configuration."),
   ("1756-IB16","ControlLogix I/O","Digital input module example. Verify wiring, terminal block and rack requirements."),
   ("1747-L552","SLC 500","SLC 5/05 controller example. Confirm programme, network and module compatibility."),
   ("2711P-T7C4D8","PanelView","Operator interface part reference. Confirm display revision and project backup.")
  ],
  "faq":[("Can a later Allen-Bradley CPU replace an older one?","Sometimes, but often only with engineering work. Firmware, software, communications and I/O may need changes."),
         ("Can you investigate discontinued SLC and PanelView parts?","Yes, with the full 1747/2711 order number and the required condition."),
         ("Are the parts on this page immediately available?","Not necessarily. They are identified examples for sourcing requests, not published stock offers.")],
  "guide":("/allen-bradley-slc-500-discontinued.html","Read the Allen-Bradley SLC 500 lifecycle guide")
 }
}

def brand_body(data):
    label=data["label"]
    trail=[("Sourcing directory",HUB),(label,"/"+data["path"])]
    heading=label+' spares. <span class="growth-highlight">Sourced with care.</span>'
    b=hero(trail,label.upper()+" / PLC AND INDUSTRIAL CONTROLS",heading,H.escape(data["intro"]))
    b+='<section><div class="growth-wrap">'+section_header("Product families","Equipment we <span class=\"growth-highlight\">investigate.</span>","The original module label and exact part number are the starting point; supplier availability is confirmed only after enquiry.")
    b+='<div class="growth-grid-2">'
    for family,explain in data["families"]:
        b+=card(H.escape(family),H.escape(explain),quote_url(),"Ask us to source a part","PLATFORM")
    b+='</div></div></section>'
    b+='<section class="growth-soft"><div class="growth-wrap">'+section_header("Reference examples","Commonly searched <span class=\"growth-highlight\">part numbers.</span>","Illustrative manufacturer references to help start an enquiry. These are not live stock listings.")
    b+=stock_examples(data["items"])+'<div style="margin-top:28px">'+note()+'</div></div></section>'
    b+='<section><div class="growth-wrap">'+section_header("Engineering matters","Before you order a replacement","A correctly identified spare is worth far more than a visually similar module.")
    b+='<div class="growth-how"><div><span>CHECK 01</span><h3>Exact order number</h3><p>Read the label, including every prefix and suffix. Where possible send a clear photo.</p></div><div><span>CHECK 02</span><h3>Firmware &amp; revision</h3><p>Check compatibility with the existing PLC, HMI or drive project, accessories and communication method.</p></div><div><span>CHECK 03</span><h3>Unit condition</h3><p>Agree new, used or refurbished condition, warranty and available testing before committing.</p></div></div>'
    b+='<p style="margin-top:23px"><a class="growth-link" href="'+data["guide"][0]+'">'+H.escape(data["guide"][1])+' &rarr;</a></p></div></section>'
    b+='<section class="growth-soft"><div class="growth-wrap">'+section_header("Questions buyers ask",label+" sourcing FAQ","A clear answer before you commit money to a discontinued spare.")
    b+='<div class="growth-faq">'
    for q,a in data["faq"]:b+=f'<article><h3>{H.escape(q)}</h3><p>{H.escape(a)}</p></article>'
    b+='</div></div></section>'
    b+='<section><div class="growth-wrap"><div class="growth-quote"><div><div class="growth-kicker">Quote request</div><h2>Know your <span class="growth-highlight">part number?</span></h2><p>Send the full '+H.escape(label)+' order code, quantity, required condition and location.</p></div><a class="growth-btn" href="'+quote_url()+'">Request a quotation &rarr;</a></div></div></section>'
    return b

def page(slug,title,description,body,header,footer):
    canonical=BASE+"/"+slug
    crumbs=[{"@type":"ListItem","position":1,"name":"Home","item":BASE+"/"}]
    if slug!="source-parts.html": crumbs.append({"@type":"ListItem","position":2,"name":"Sourcing directory","item":BASE+HUB})
    crumbs.append({"@type":"ListItem","position":len(crumbs)+1,"name":("Sourcing directory" if slug=="source-parts.html" else BRANDS["siemens" if "siemens" in slug else "allen"]["label"]),"item":canonical})
    schema={"@context":"https://schema.org","@type":"CollectionPage" if slug=="source-parts.html" else "Service",
        "name":title,"url":canonical,"description":description,"provider":{"@type":"Organization","name":"Automation Outlet","url":BASE+"/"}}
    cr={"@context":"https://schema.org","@type":"BreadcrumbList","itemListElement":crumbs}
    meta=f'''<!doctype html>
<html lang="en-GB"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>{H.escape(title)}</title><meta name="description" content="{H.escape(description,quote=True)}">
<link rel="canonical" href="{canonical}">
<meta property="og:type" content="website"><meta property="og:site_name" content="Automation Outlet">
<meta property="og:title" content="{H.escape(title,quote=True)}"><meta property="og:description" content="{H.escape(description,quote=True)}"><meta property="og:url" content="{canonical}">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@600;700;800&family=Barlow:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/styles.css"><link rel="stylesheet" href="/growth.css">
<script type="application/ld+json">{json.dumps(schema)}</script><script type="application/ld+json">{json.dumps(cr)}</script>
</head><body>'''
    nav_script='''<script>
const navToggle=document.getElementById("navToggle"),mobileMenu=document.getElementById("mobileMenu");
if(navToggle&&mobileMenu)navToggle.addEventListener("click",()=>{const open=mobileMenu.classList.toggle("open");navToggle.setAttribute("aria-expanded",String(open));});
</script>'''
    return meta+header+'<main class="growth-page">'+body+'</main>'+footer+nav_script+'</body></html>'

def main():
    index=ROOT/"index.html"
    old=index.read_text(encoding="utf-8")
    header=re.search(r'<header>.*?</header>',old,re.S)
    footer=re.search(r'<footer>.*?</footer>',old,re.S)
    if not header or not footer:raise RuntimeError("Missing original shared header/footer")
    nav=header.group(0).replace('>Obsolete parts</a>','>Source parts</a>')
    nav=nav.replace('<a href="/sell-surplus.html" class="btn">Get a surplus offer</a>',
                    '<a href="/obsolete-parts-sourcing.html" class="btn">Source a part</a>')
    nav=nav.replace('<a href="/sell-surplus.html" class="btn big">Get a surplus offer</a>',
                    '<a href="/obsolete-parts-sourcing.html" class="btn big">Source a part</a>')
    foot=footer.group(0)
    home=(ROOT/"_blocks/growth_home.html").read_text(encoding="utf-8")
    feature=(ROOT/"_blocks/home_featured.html").read_text(encoding="utf-8")
    if home.count('<!-- FEATURED_STOCK -->')!=1:raise RuntimeError("Missing home stock insertion anchor")
    home=home.replace('<!-- FEATURED_STOCK -->',feature)
    if old.count("<main>")!=1 or old.count("</main>")!=1:raise RuntimeError("Homepage generated main markers changed")
    fresh=re.sub(r'<main>.*?</main>',lambda m:home,old,flags=re.S,count=1)
    fresh=fresh.replace('>Obsolete parts</a>','>Source parts</a>')
    fresh=fresh.replace('<a href="/sell-surplus.html" class="btn">Get a surplus offer</a>',
                        '<a href="/obsolete-parts-sourcing.html" class="btn">Source a part</a>')
    fresh=fresh.replace('<a href="/sell-surplus.html" class="btn big">Get a surplus offer</a>',
                        '<a href="/obsolete-parts-sourcing.html" class="btn big">Source a part</a>')
    fresh=fresh.replace('<link rel="stylesheet" href="/styles.css">',
                        '<link rel="stylesheet" href="/styles.css">\n<link rel="stylesheet" href="/growth.css">',1)
    fresh=re.sub(r'<title>.*?</title>','<title>Industrial Automation Spares &amp; PLC Sourcing UK | Automation Outlet</title>',fresh,count=1,flags=re.S)
    fresh=re.sub(r'(<meta name="description" content=")[^"]*(")',r'\1Buy available automation spares or request sourcing for obsolete Siemens, Allen-Bradley, PLC, HMI and drive parts. Engineer-led UK service with clear stock status.\2',fresh,count=1)
    fresh=re.sub(r'(<meta property="og:title" content=")[^"]*(")',r'\1Industrial Automation Spares &amp; PLC Sourcing UK | Automation Outlet\2',fresh,count=1)
    fresh=re.sub(r'(<meta property="og:description" content=")[^"]*(")',r'\1Buy available parts or request sourcing of hard-to-find PLCs, HMIs and drives through UK-based Automation Outlet.\2',fresh,count=1)
    index.write_text(fresh,encoding="utf-8")

    (ROOT/"source-parts.html").write_text(
        page("source-parts.html","Obsolete PLC & Industrial Automation Parts Sourcing UK | Automation Outlet",
             "Request Siemens, Allen-Bradley, Omron, Mitsubishi and obsolete industrial automation parts. Exact part-number sourcing enquiries with verified condition and availability.",
             hub_body(),nav,foot),encoding="utf-8")
    for data in BRANDS.values():
        (ROOT/data["path"]).write_text(page(data["path"],data["title"],data["description"],brand_body(data),nav,foot),encoding="utf-8")

    sourcing=ROOT/"obsolete-parts-sourcing.html"
    text=sourcing.read_text(encoding="utf-8")
    needle='const partForm = document.getElementById("partForm");'
    inject='''// Preserve a requested manufacturer part number through all sourcing CTAs.
try {
  const incoming = new URLSearchParams(window.location.search).get("part");
  const input = document.getElementById("p-part");
  if (input && incoming && incoming.length <= 100) input.value = incoming;
} catch (_) { /* manual enquiry remains available */ }

'''
    if needle not in text:raise RuntimeError("Sourcing form integration anchor missing")
    if "const incoming = new URLSearchParams" not in text:
        text=text.replace(needle,inject+needle,1)
    sourcing.write_text(text,encoding="utf-8")
    print("growth enhancement: buyer-first homepage, 3 sourcing pages and prefilled enquiries")

if __name__=="__main__":main()

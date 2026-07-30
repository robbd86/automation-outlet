#!/usr/bin/env python3
"""Generates the Automation Outlet multi-page site.
Run:  python3 build.py
Edit content here, not in the generated .html files.
"""
import os

WA = "447849506371"
NOINDEX = ''
BLOCK = lambda n: open(f'_blocks/{n}.html').read()

NAV = [
    ("Sell to us", "/sell-surplus.html"),
    ("Buy stock", "/buy-stock.html"),
    ("Obsolete parts", "/obsolete-parts-sourcing.html"),
    ("Services", "/services.html"),
    ("Contact", "/contact.html"),
]

FOOTER_LINKS = [
    ("Sell surplus PLCs", "/sell-surplus-plcs.html"),
    ("Sell control panels", "/sell-control-panels.html"),
    ("Factory clearance", "/factory-clearance.html"),
    ("Obsolete parts sourcing", "/obsolete-parts-sourcing.html"),
    ("PLC &amp; HMI programming", "/plc-programming.html"),
    ("Bench testing", "/bench-testing.html"),
    ("Privacy notice", "/privacy.html"),
]

WA_SVG = '<svg viewBox="0 0 32 32"><path d="M16.004 3C9.383 3 4 8.383 4 15.004c0 2.65.867 5.107 2.334 7.096L4.06 28.939l7.05-2.23a11.94 11.94 0 0 0 4.895 1.042C22.625 27.75 28 22.367 28 15.746 28 8.383 22.625 3 16.004 3zm0 21.938a9.9 9.9 0 0 1-5.045-1.377l-.361-.214-3.742 1.184 1.207-3.65-.235-.375a9.88 9.88 0 0 1-1.516-5.256c0-5.47 4.452-9.922 9.926-9.922 5.47 0 9.922 4.452 9.922 9.926 0 5.47-4.452 9.684-10.156 9.684zm5.443-7.403c-.298-.15-1.765-.87-2.039-.969-.273-.1-.472-.149-.671.149-.198.298-.77.968-.944 1.166-.174.199-.348.224-.646.075-.298-.15-1.259-.464-2.398-1.48-.887-.79-1.485-1.767-1.66-2.065-.173-.298-.018-.459.131-.607.134-.134.298-.348.447-.522.15-.174.199-.298.298-.497.1-.198.05-.372-.025-.521-.074-.15-.67-1.617-.919-2.214-.242-.58-.487-.501-.67-.51l-.571-.01c-.198 0-.521.074-.794.372-.273.298-1.042 1.018-1.042 2.484 0 1.465 1.067 2.881 1.216 3.08.149.198 2.099 3.205 5.085 4.494.71.307 1.264.49 1.696.628.712.226 1.36.194 1.873.118.571-.085 1.765-.722 2.014-1.42.248-.696.248-1.293.173-1.418-.074-.124-.272-.198-.57-.347z"/></svg>'


def nav_html(active):
    links = "".join(
        f'<a href="{href}"{" style=\"color:var(--white)\"" if href == active else ""}>{label}</a>'
        for label, href in NAV)
    mob = "".join(f'<a href="{href}">{label}</a>' for label, href in NAV)
    return f'''<header>
  <div class="wrap nav">
    <a href="/" class="logo"><span class="gear">&#9881;</span>Automation <span>Outlet</span></a>
    <nav class="nav-links">
      {links}
      <a href="/sell-surplus.html" class="btn">Get a quote</a>
    </nav>
    <button class="nav-toggle" id="navToggle" aria-label="Open menu" aria-expanded="false">
      <span></span><span></span><span></span>
    </button>
  </div>
  <nav class="mobile-menu" id="mobileMenu">
    {mob}
    <a href="/sell-surplus.html" class="btn big">Get a quote</a>
  </nav>
</header>'''


def footer_html():
    links = " &middot; ".join(f'<a href="{h}">{l}</a>' for l, h in FOOTER_LINKS)
    return f'''<footer>
  <div class="wrap foot">
    <div>
      <div class="logo"><span class="gear">&#9881;</span>Automation <span>Outlet</span></div>
      <p style="margin-top:.5rem">Industrial automation solutions &middot; Cambridgeshire, UK</p>
      <p style="margin-top:.4rem;font-size:.82rem">Areas we cover: Cambridgeshire, Bedfordshire &amp; East Anglia &mdash; with collection and remote support available UK-wide.</p>
      <p style="margin-top:.6rem">&#128241; <a href="https://wa.me/{WA}">07849 506371 (WhatsApp)</a> &nbsp;&middot;&nbsp; &#9993; <a href="mailto:info@automation-outlet.co.uk">info@automation-outlet.co.uk</a></p>
    </div>
    <div class="foot-badges">
      <span>&#128222; Fast response</span>
      <span>&#9993; No obligation</span>
      <span>&#127468;&#127463; UK wide service</span>
    </div>
  </div>
  <div class="wrap" style="margin-top:1.4rem;padding-top:1.2rem;border-top:1px solid var(--line);font-size:.82rem;color:var(--grey)">
    {links}
  </div>
</footer>'''


def page(slug, title, desc, body, active=None, wa_text="Hi%2C%20I%27d%20like%20a%20quote", extra_js=""):
    canonical = "https://www.automation-outlet.co.uk/" + ("" if slug == "index" else slug + ".html")
    html = f'''<!DOCTYPE html>
<html lang="en-GB">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>{title}</title>
<meta name="description" content="{desc}">
<link rel="canonical" href="{canonical}">
{NOINDEX}
<meta property="og:type" content="website">
<meta property="og:site_name" content="Automation Outlet">
<meta property="og:title" content="{title}">
<meta property="og:description" content="{desc}">
<meta property="og:url" content="{canonical}">
<meta property="og:locale" content="en_GB">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@600;700;800&family=Barlow:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/styles.css">
</head>
<body>

{nav_html(active or ("/" if slug == "index" else "/" + slug + ".html"))}

<main>
{body}
</main>

{footer_html()}

<a class="wa-float" href="https://wa.me/{WA}?text={wa_text}" target="_blank" rel="noopener" aria-label="Chat on WhatsApp">
  {WA_SVG}
</a>

<script>
const navToggle = document.getElementById("navToggle");
const mobileMenu = document.getElementById("mobileMenu");
navToggle.addEventListener("click", () => {{
  const open = mobileMenu.classList.toggle("open");
  navToggle.setAttribute("aria-expanded", open ? "true" : "false");
}});
const FORM_ENDPOINT = "https://formspree.io/f/xqevvvll";
{extra_js}
</script>
</body>
</html>
'''
    fname = ("index" if slug == "index" else slug) + ".html"
    open(fname, "w").write(html)
    return fname


def hero(eyebrow, h1, intro, ctas, note=""):
    btns = "".join(
        f'<a href="{h}" class="btn big{" ghost" if i else ""}"{" target=_blank rel=noopener" if h.startswith("http") else ""}>{l}</a>'
        for i, (l, h) in enumerate(ctas))
    n = f'<p class="hero-note">{note}</p>' if note else ""
    return f'''<div class="hero" style="padding:3.8rem 0 3.2rem">
  <div class="wrap">
    <div class="eyebrow">{eyebrow}</div>
    <h1 style="font-size:clamp(2.2rem,6vw,3.9rem)">{h1}</h1>
    <p>{intro}</p>
    <div class="hero-ctas">{btns}</div>
    {n}
  </div>
</div>'''


def steps(items, heading=None):
    head = f'<div class="sec-head"><h2>{heading}</h2></div>' if heading else ""
    cards = "".join(f'<div class="step"><div class="n">{n}</div><h3>{h}</h3><p>{p}</p></div>' for n, h, p in items)
    return f'<section style="padding:3.2rem 0"><div class="wrap">{head}<div class="steps">{cards}</div></div></section>'


def prose(heading, paras):
    body = "".join(f'<p style="color:var(--grey);max-width:720px;margin-bottom:1rem">{p}</p>' for p in paras)
    return f'<section style="padding:2.6rem 0"><div class="wrap"><div class="sec-head"><h2>{heading}</h2></div>{body}</div></section>'


def faq(qas):
    items = "".join(f'<div class="step"><h3 style="font-size:1.15rem">{q}</h3><p>{a}</p></div>' for q, a in qas)
    return f'<section style="padding:2.6rem 0"><div class="wrap"><div class="sec-head"><h2>Common <span>questions</span></h2></div><div class="steps">{items}</div></div></section>'


def cta_band(h2, p, label, href):
    return f'''<section class="quote" style="padding:3.2rem 0">
  <div class="wrap">
    <div class="sec-head"><h2>{h2}</h2><p>{p}</p></div>
    <a href="{href}" class="btn big">{label}</a>
    <p class="services-note" style="margin-top:1.2rem">Or message us on <a href="https://wa.me/{WA}">WhatsApp &mdash; 07849 506371</a> &middot; <a href="mailto:info@automation-outlet.co.uk">info@automation-outlet.co.uk</a></p>
  </div>
</section>'''


def cards(items):
    """items: (title, blurb, link_label, href)"""
    c = "".join(
        f'<div class="path"><h3>{t}</h3><p>{b}</p><a class="link" href="{h}">{l} &rarr;</a></div>'
        for t, b, l, h in items)
    return f'<section style="padding:2.8rem 0"><div class="wrap"><div class="paths" style="margin:0">{c}</div></div></section>'


# ---------------------------------------------------------------- PAGES

TICKER = '''<div class="ticker" aria-hidden="true">
  <div class="ticker-track mono">
    <b>6ES7 315-2AG10</b> SIEMENS S7-300 CPU &nbsp;&middot;&nbsp; <b>NX1P2-1140DT</b> OMRON MACHINE CONTROLLER &nbsp;&middot;&nbsp; <b>1756-L61</b> ALLEN-BRADLEY CONTROLLOGIX &nbsp;&middot;&nbsp; <b>FX5U-32MT/ESS</b> MITSUBISHI IQ-F &nbsp;&middot;&nbsp; <b>6AV2 124-0GC01</b> SIMATIC HMI TP700 &nbsp;&middot;&nbsp; <b>ACS580-01</b> ABB DRIVE &nbsp;&middot;&nbsp; <b>25B-D010N104</b> POWERFLEX 525 &nbsp;&middot;&nbsp; <b>CJ2M-CPU31</b> OMRON CJ2 &nbsp;&middot;&nbsp; <b>6ES7 315-2AG10</b> SIEMENS S7-300 CPU &nbsp;&middot;&nbsp; <b>NX1P2-1140DT</b> OMRON MACHINE CONTROLLER &nbsp;&middot;&nbsp; <b>1756-L61</b> ALLEN-BRADLEY CONTROLLOGIX &nbsp;&middot;&nbsp; <b>FX5U-32MT/ESS</b> MITSUBISHI IQ-F &nbsp;&middot;&nbsp; <b>6AV2 124-0GC01</b> SIMATIC HMI TP700 &nbsp;&middot;&nbsp; <b>ACS580-01</b> ABB DRIVE &nbsp;&middot;&nbsp; <b>25B-D010N104</b> POWERFLEX 525 &nbsp;&middot;&nbsp; <b>CJ2M-CPU31</b> OMRON CJ2 &nbsp;&middot;&nbsp;
  </div>
</div>'''

TRUST = '''<section style="padding:2.4rem 0">
  <div class="wrap">
    <div class="trust">
      <div><h4>Free UK collection</h4><p>We can arrange collection anywhere in the UK.</p></div>
      <div><h4>Same-day quotes</h4><p>Quick, no-obligation quotes &mdash; often same day.</p></div>
      <div><h4>Single items to clearances</h4><p>One PLC or a complete plant takeout &mdash; both welcome.</p></div>
      <div><h4>Engineer-run</h4><p>Run by a controls engineer with 10+ years on the tools.</p></div>
    </div>
  </div>
</section>'''

# ---- HOME (landing page, not a scroll) ----
home_body = (
    TICKER
    + hero("Industrial Automation Solutions &middot; UK Wide",
           "Cash paid for <em>surplus PLCs, HMIs, drives</em> &amp; control panels",
           "We buy and sell new, used and surplus industrial automation equipment across the UK &mdash; from a single item to a full plant takeout. Engineer-run, honestly priced, collected free.",
           [("Sell your surplus", "/sell-surplus.html"), ("Buy tested stock", "/buy-stock.html")],
           "<b>Fast &amp; easy:</b> send a few photos or a list &mdash; we'll take it from there.")
    + cards([
        ("Selling <span>surplus?</span>",
         "Decommissioned panels, spares-store clear-outs, obsolete stock or end-of-project surplus. Fair offers on real market value, quotes often same day, free UK collection.",
         "List your items", "/sell-surplus.html"),
        ("Buying <span>parts?</span>",
         "Tested, working PLCs, HMIs and drives at a fraction of list price &mdash; every unit bench-checked by a time-served controls engineer before it's listed.",
         "Browse our stock", "/buy-stock.html"),
    ])
    + TRUST
    + cards([
        ("Obsolete <span>part?</span>",
         "OEM says end-of-life, distributors say no stock. That's where we start &mdash; sourcing discontinued PLCs, HMIs and drives through our network and the surplus market.",
         "Obsolete parts sourcing", "/obsolete-parts-sourcing.html"),
        ("Engineering <span>services</span>",
         "PLC and HMI programming, control panel builds and independent bench testing &mdash; 10+ years of factory-floor controls experience.",
         "See our services", "/services.html"),
    ])
    + cta_band("Not sure where to <span>start?</span>",
               "Tell us what you've got or what you need &mdash; we'll point you the right way, usually the same working day.",
               "Get in touch", "/contact.html")
)
page("index",
     "Automation Outlet &mdash; Cash Paid for Surplus PLCs, HMIs &amp; Drives | UK Wide",
     "Automation Outlet buys and sells new, used and surplus industrial automation equipment across the UK. Same-day quotes, free UK collection. Siemens, Omron, Allen-Bradley, Mitsubishi.",
     home_body, active="/", wa_text="Hi%2C%20I%27d%20like%20to%20talk%20about%20automation%20equipment")

# ---- SELL TO US (hosts the multi-line sell form) ----
sell_body = (
    hero("Sell to us &middot; UK wide",
         "Sell your <em>surplus automation equipment</em>",
         "PLCs, HMIs, drives, control panels and spares-store stock &mdash; working, untested or faulty. List what you've got below and we'll come back with a fair, no-obligation offer, usually the same working day.",
         [("List your items", "#sell-form"), ("WhatsApp us", f"https://wa.me/{WA}?text=Hi%2C%20I%27ve%20got%20surplus%20equipment%20to%20sell")])
    + BLOCK('buygrid')
    + BLOCK('how')
    + BLOCK('sell_form_section')
    + BLOCK('brands')
    + cards([
        ("Sell surplus <span>PLCs</span>", "Siemens, Allen-Bradley, Omron, Mitsubishi and more &mdash; any condition.", "PLC buying guide", "/sell-surplus-plcs.html"),
        ("Sell control <span>panels</span>", "We price on the kit inside, not scrap weight &mdash; and we collect.", "Panel buying guide", "/sell-control-panels.html"),
        ("Factory <span>clearance</span>", "Site closing or line decommissioned? One price for the lot.", "Clearance service", "/factory-clearance.html"),
    ])
)
page("sell-surplus",
     "Sell Surplus Automation Equipment UK &mdash; Cash Paid, Free Collection | Automation Outlet",
     "Sell surplus PLCs, HMIs, drives and control panels anywhere in the UK. Same-day quotes, fair market prices, free collection. List your items online in minutes.",
     sell_body, wa_text="Hi%2C%20I%27ve%20got%20surplus%20equipment%20to%20sell",
     extra_js=BLOCK('sellform_js'))

# ---- BUY STOCK ----
buy_body = (
    hero("Buy &middot; tested &amp; ready",
         "Buy <em>tested</em> automation parts",
         "Every PLC, HMI and drive we sell is powered up and function-tested by a controls engineer before it's listed &mdash; so you know what you're getting. Obsolete and hard-to-find parts a speciality.",
         [("View stock on eBay", "https://www.ebay.co.uk"), ("Ask us to source a part", "/obsolete-parts-sourcing.html")])
    + steps([
        ("TESTED", "Bench-checked before listing", "Powered up and function-tested, with condition described honestly &mdash; including anything we couldn't test and why."),
        ("PRICED", "A fraction of list", "Surplus and used kit at sensible money, without OEM lead times or new-build pricing."),
        ("OBSOLETE", "The stuff nobody stocks", "Legacy processors, discontinued HMIs and end-of-life drives &mdash; the parts that keep older lines running."),
    ], "Why buy <span>from us</span>")
    + BLOCK('brands')
    + cta_band("Can't see what you <span>need?</span>",
               "Most of our stock never makes it to a listing. Tell us the part number and we'll check the shelf and our network.",
               "Ask us to source it", "/obsolete-parts-sourcing.html")
)
page("buy-stock",
     "Buy Used &amp; Surplus PLCs, HMIs and Drives UK | Automation Outlet",
     "Buy bench-tested used and surplus industrial automation parts &mdash; PLCs, HMIs, drives. Obsolete and hard-to-find parts a speciality. UK despatch.",
     buy_body, wa_text="Hi%2C%20I%27m%20looking%20for%20a%20part")

# ---- SERVICES hub ----
services_body = (
    hero("Engineering services",
         "We also <em>offer</em>",
         "Beyond buying and selling, we put 10+ years of factory-floor controls experience to work for UK manufacturers, machine builders and maintenance teams.",
         [("Discuss a job", "/contact.html"), ("WhatsApp us", f"https://wa.me/{WA}?text=Hi%2C%20I%27d%20like%20to%20discuss%20a%20job")])
    + BLOCK('services').replace('<a href="#quote">Get in touch</a>', '<a href="/contact.html">Get in touch</a>')
    + cards([
        ("PLC &amp; HMI <span>programming</span>", "New code, modifications and fault-finding across Siemens, Omron, Allen-Bradley and Mitsubishi.", "Read more", "/plc-programming.html"),
        ("Bench <span>testing</span>", "Independent testing so you know what works before you buy, sell or fit it.", "Read more", "/bench-testing.html"),
        ("Panel <span>builds</span>", "Control panels designed, assembled, wired and documented to spec.", "Read more", "/sell-control-panels.html"),
    ])
    + cta_band("Got a controls <span>problem?</span>",
               "Describe the machine, the platform and the symptom &mdash; we'll tell you honestly whether it's a quick fix or a proper job.",
               "Get in touch", "/contact.html")
)
page("services",
     "PLC Programming, Panel Builds &amp; Bench Testing UK | Automation Outlet",
     "Engineering services for UK manufacturers: PLC and HMI programming, control panel builds and independent bench testing. Siemens, Omron, Allen-Bradley, Mitsubishi.",
     services_body, wa_text="Hi%2C%20I%27d%20like%20to%20discuss%20a%20job")

# ---- CONTACT (general quote form) ----
contact_body = (
    hero("Contact",
         "Get a <em>quote</em>",
         "Selling surplus, chasing a part, or need something programmed, built or tested? Tell us what you're after and we'll come straight back &mdash; usually the same working day.",
         [("WhatsApp us", f"https://wa.me/{WA}?text=Hi%2C%20I%27d%20like%20a%20quote"), ("Email us", "mailto:info@automation-outlet.co.uk")])
    + BLOCK('quoteform')
    + TRUST
)
page("contact",
     "Contact Automation Outlet &mdash; Quotes, Sourcing &amp; Services | UK",
     "Contact Automation Outlet for surplus equipment quotes, obsolete part sourcing, PLC programming and bench testing. WhatsApp, email or online form.",
     contact_body,
     extra_js='''const form = document.getElementById("quoteForm");
const statusEl = document.getElementById("formStatus");
const submitBtn = form.querySelector("button[type=submit]");
form.addEventListener("submit", async function(e){
  e.preventDefault();
  statusEl.style.color = ""; statusEl.textContent = "Sending\\u2026"; submitBtn.disabled = true;
  try {
    const res = await fetch(FORM_ENDPOINT, {method:"POST", body:new FormData(form), headers:{"Accept":"application/json"}});
    if (res.ok) { form.reset(); statusEl.style.color="var(--blue-bright)"; statusEl.textContent="Thanks \\u2014 your details are on their way. We'll be in touch, usually the same working day."; }
    else { statusEl.style.color="#ff8080"; statusEl.textContent="Something went wrong \\u2014 please email us directly at info@automation-outlet.co.uk."; }
  } catch (err) { statusEl.style.color="#ff8080"; statusEl.textContent="Network error \\u2014 please email us directly at info@automation-outlet.co.uk."; }
  finally { submitBtn.disabled = false; }
});''')

print("built:", sorted(f for f in os.listdir('.') if f.endswith('.html')))

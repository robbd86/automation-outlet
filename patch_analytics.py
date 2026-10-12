#!/usr/bin/env python3
"""Post-build optional GA4 instrumentation: no external analytics until consent.

The ID is set using Vercel build env AO_GA4_MEASUREMENT_ID. Until configured,
no cookie banner or analytics calls appear. Existing form and checkout flows
are otherwise unchanged.
"""
from __future__ import annotations

import json
import os
import re
from pathlib import Path

ROOT=Path(__file__).resolve().parent
TRACKING_TAG='<script src="/ao-analytics.js" defer></script>'
EXCLUDED={
    "agent-desk.html","deal-desk.html","stock-admin.html","orders-admin.html",
    "buyer-network-admin.html","plc-audit-upload.html","plc-audit-dashboard.html",
    "plc-audit-audit.html",
}

def require_replace(text, old, new, label):
    if old not in text:
        raise RuntimeError("Tracking integration changed: " + label)
    return text.replace(old,new,1)

def main():
    id_value=os.environ.get("AO_GA4_MEASUREMENT_ID","").strip().upper()
    if id_value and not re.fullmatch(r"G-[A-Z0-9]{5,15}",id_value):
        raise RuntimeError("AO_GA4_MEASUREMENT_ID must be a valid G- measurement ID")
    (ROOT/"ao-ga4-config.json").write_text(
        json.dumps({"measurementId":id_value},separators=(",",":"))+"\n",encoding="utf-8"
    )
    tracked=0
    for path in ROOT.glob("*.html"):
        name=path.name
        if name in EXCLUDED or name.endswith("-admin.html"):
            continue
        original=path.read_text(encoding="utf-8")
        if "</head>" not in original:
            continue
        text=original if TRACKING_TAG in original else original.replace("</head>",TRACKING_TAG+"\n</head>",1)
        if name=="obsolete-parts-sourcing.html" and 'lead_type:"sourcing"' not in text:
            text=require_replace(text,"if (res.ok) { partForm.reset();",
                'if (res.ok) { window.AOAnalytics?.track("generate_lead",{lead_type:"sourcing"}); partForm.reset();',
                "verified sourcing Formspree response")
        elif name=="sell-surplus.html" and 'lead_type:"seller"' not in text:
            text=require_replace(text,"    sellForm.reset();",
                '    window.AOAnalytics?.track("generate_lead",{lead_type:"seller"});\n    sellForm.reset();',
                "saved seller enquiry")
        elif name=="consignment.html" and 'lead_type:"consignment"' not in text:
            text=require_replace(text,"    consignmentForm.reset();",
                '    window.AOAnalytics?.track("generate_lead",{lead_type:"consignment"});\n    consignmentForm.reset();',
                "saved consignment enquiry")
        elif name=="contact.html" and 'lead_type:"contact"' not in text:
            text=require_replace(text,"    if (res.ok) {\n      form.reset();",
                '    if (res.ok) {\n      window.AOAnalytics?.track("generate_lead",{lead_type:"contact"});\n      form.reset();',
                "confirmed contact enquiry")
        elif name=="cart.html" and 'AOAnalytics?.track("begin_checkout")' not in text:
            text=require_replace(text,"  if(!response.ok||!data.url) throw new Error(data.error||\"Could not start checkout.\");\n  location.assign(data.url);",
                '  if(!response.ok||!data.url) throw new Error(data.error||"Could not start checkout.");\n  if(checkoutMode==="live") window.AOAnalytics?.track("begin_checkout");\n  location.assign(data.url);',
                "Stripe checkout started")
        elif name=="order-success.html" and 'ao-purchase-tracked-' not in text:
            old='  try{localStorage.removeItem("aoCartV1");}catch{}'
            injected='''  // Count only Stripe-verified live purchases, never sandbox/commissioning
  // payments or unacknowledged webhook states. Hash the opaque Stripe
  // session identifier and avoid duplicate tracking on refresh.
  if(verifiedLive && !verifiedCommissioning && data.webhookAcknowledged && window.AOAnalytics?.hasConsent()){
    try{
      const digest=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(id));
      const hash=Array.from(new Uint8Array(digest)).slice(0,12).map(n=>n.toString(16).padStart(2,"0")).join("");
      const transactionId="ao_"+hash;
      const storageKey="ao-purchase-tracked-"+hash;
      if(sessionStorage.getItem(storageKey)!=="1"){
        const tracked=window.AOAnalytics.track("purchase",{
          transaction_id:transactionId,
          value:(Number(data.amountTotal)||0)/100,
          currency:String(data.currency||"GBP").toUpperCase()
        });
        if(tracked)sessionStorage.setItem(storageKey,"1");
      }
    }catch(err){console.warn("Optional purchase analytics unavailable");}
  }
'''
            text=require_replace(text,old,injected+old,"Stripe-verified purchase")
        path.write_text(text,encoding="utf-8")
        tracked+=1

    privacy=ROOT/"privacy.html"
    body=privacy.read_text(encoding="utf-8")
    anchor='<div class="sec-head" style="margin-top:2.4rem"><h2>Your <span>choices</span></h2></div>'
    notice=('''<div class="sec-head" style="margin-top:2.4rem"><h2>Optional <span>website analytics</span></h2></div>
      <p style="color:var(--grey);margin-bottom:1rem">If you choose to accept analytics, we use Google Analytics 4 to understand which pages are visited and whether visitors start stock searches, sourcing requests, seller enquiries or checkout. This is optional; the site works without it. We only load the Analytics tag after consent and do not intentionally send your name, contact information, free-text search terms, enquiry details or Stripe session IDs to Google Analytics.</p>
      <p style="color:var(--grey);margin-bottom:1rem">Your choice is saved on this device for up to 180 days. Use the <strong>Privacy choices</strong> control on the website to change it at any time. Analytics data may be processed by Google under its service terms. Purchase analytics are based on a verified return to our payment confirmation page and may not capture every completed payment.</p>
      ''')
    if anchor not in body:raise RuntimeError("Privacy notice insertion anchor missing")
    if "Optional <span>website analytics</span>" not in body:
        body=body.replace(anchor,notice+anchor,1)
    body=body.replace('Last updated: 8 October 2026.','Last updated: 12 October 2026.')
    privacy.write_text(body,encoding="utf-8")
    print(f"Optional analytics hook installed on {tracked} static HTML pages. GA4 configured: {bool(id_value)}")

if __name__=="__main__":main()

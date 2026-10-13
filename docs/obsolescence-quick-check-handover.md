# AO Free Obsolescence Quick Check — preview handover (13 October 2026)

## What this changes
A buyer-first, up-to-five-part-number check at /obsolescence-check.html. It reuses the AO site styles, the existing /api/network-signup Vercel function (to stay within the Hobby function limit), existing server-side AIRTABLE_ACCESS_TOKEN and a dedicated quick-check Airtable intake table. A separate lifecycle cache table is ready for engineer-verified records. The form records buyer intent for "Check lifecycle", "Source a spare" or "Plan critical spares".

**Production remains unchanged while the feature branch is unmerged.** Do not merge/publish, import contacts or activate automated emails without approval.

## Preview branch and Airtable
- Branch: feature/obsolescence-quick-check.
- New customer page: /obsolescence-check.html.
- Route: /api/obsolescence-check rewrites to /api/network-signup?quickCheck=1 and calls lib/obsolescence-check.mjs.
- Airtable base: Automation Outlet Network (app60WbULZ9PbuKQv).
- Table: Obsolescence Quick Checks (tblwv21sLnCvovQ9S).
- Cache: Lifecycle Verification Cache (tbl0ScTF0KEnkxLam).
- Branch-scoped preview environment settings: AO_QUICK_CHECK_BASE_ID, AO_QUICK_CHECK_TABLE_ID, AO_QUICK_CHECK_ENABLED=true.
- Existing AIRTABLE_ACCESS_TOKEN is reused, kept on the server. No token is committed to the site.
- No public summary is generated automatically. No customer marketing, acknowledgement or stock offer is auto-sent in this preview.
- On submission, a row is created with a unique request reference; status starts at New.
- On the eventual production deployment, the intake stays disabled unless production-scoped AO_QUICK_CHECK_* settings are configured. This is intentional.

## Manual engineer SOP (one request at a time)
1. Open the **Obsolescence Quick Checks** Airtable table, filter Status = New. Prioritise Machine is down now / Source a spare; urgently contact customer through their requested channel. Do not promise 24/7 response.
2. Check each **exact order code** and revision/firmware where applicable against the official source. Never assign a date at family level to a specific part without verification. Capture URL, verification date, vendor lifecycle term and any published successor. Unknown stays "Unknown — check".
   - Siemens: https://support.industry.siemens.com / https://mall.industry.siemens.com
   - Rockwell: https://www.rockwellautomation.com/en-us/support/product/product-compatibility-migration/product-lifecycle-status.html
   - Omron: https://automation.omron.com/en/us/products/product-lifecycle-status
   - Mitsubishi: https://www.mitsubishielectric.com/fa/products/renewal.html
3. Check the exact code against AO's **actually listed stock** and ordinary sourcing channels. Use only Listed / Sourcing possible / Not currently / Not checked. "Sourcing possible" is not a stock guarantee.
4. Record lifecycle, manufacturer source URL and date in **Lifecycle Verification Cache**. Reconfirm if older than 90 days *or* if material circumstances change. The cache is a research aid, not proof of live stock.
5. Preliminary supply-risk guide (not production-risk ranking):
   - High: discontinued and no currently identified source, or an urgent spare need for discontinued equipment.
   - Medium: discontinued with sourcing possible, or phase-out.
   - Low: active/mature only if no other supply concern is identified.
   - Unknown: insufficient verified information; never automatically colour this green.
6. Update the request record with research notes, customer follow-up and next step. **Do not** email a summary until each line has been independently reviewed.
7. Ask for a sourcing quotation when there is a need to buy a spare. For wider machine/plant review, link to /automation-obsolescence-audit.html. For relevant incoming stock alerts, use an *explicit opt-in* and a usable unsubscribe mechanism.

## Plain-text email drafts (not sent)
### A1 — acknowledgement (manual until mailing integration approved)
Subject: AO received your part numbers — {request reference}

Hi {first name},

Thanks for sending your {count} automation part number(s). I'll check the manufacturer's lifecycle information and whether we can source a suitable spare.

I aim to reply within two working days. If your machine is already down, WhatsApp 07849 506371 so I can see it sooner.

Rob
Automation Outlet
info@automation-outlet.co.uk

### A2 — checked summary (send only after verified review)
Subject: Your AO obsolescence check — {request reference}

Hi {first name},

I've reviewed the order numbers you sent. Here is the summary:

{one row per order code: part | make | vendor status | source and checked date | published successor (if any) | AO availability | preliminary supply-risk flag | practical next step}

Where the manufacturer did not provide enough reliable information, I've marked it "Unknown — check" rather than assume a lifecycle date or successor.

If you need a spare, reply with the required part, quantity, condition and target delivery date. I'll confirm price and availability before you commit.

For a wider line, our Essential Audit is £195 for up to 20 components and covers additional production-risk and prioritised recommendations.

Desktop assessment based on the part numbers supplied and published manufacturer information. It is not an on-site inspection, safety certification, compatibility certification or guarantee of future parts availability.

Rob
Automation Outlet

### A3 — optional marketing follow-up (only opted-in)
Subject: Spares options for your reviewed equipment

Hi {first name},

Would it help to know when suitable Automation Outlet stock matching {verified part(s)} becomes available, or would you prefer a sourcing quote now? Reply with the order codes and what you need.

If you'd rather not receive these messages, unsubscribe using {live, tested preference link}.

Rob

Do not send A3 without a working unsubscribe workflow. Do not automatically send extra emails to a non-opted-in contact.

## QA & sign-off
- [x] New responsive HTML page added on feature branch
- [x] Server-side exact-code and quantity validation + honeypot
- [x] Separate required request consent / optional marketing opt-in, unticked
- [x] Conditional emergency WhatsApp advice
- [x] Airtable lead and cache tables created
- [x] No customer auto-email in preview
- [x] Existing API route reused to avoid Vercel 12-function cap
- [ ] Preview build is READY and page visually checked on mobile
- [ ] Test one Siemens, one Rockwell, one Omron, one Mitsubishi and one invalid input (synthetic contact only)
- [ ] Confirm preview sample saved as a single Airtable row, with marketing opt-in false
- [ ] Run accessibility keyboard check
- [ ] Privacy wording reviewed for UK GDPR, retention policy and Formspree/Airtable processors
- [ ] Configure owner notifications (not marketing) if desired
- [ ] Customer acknowledgement workflow if desired; never claim it exists before configured
- [ ] Rate limiting / anti-abuse outside honeypot if needed before public launch
- [ ] Decide whether to enable the optional buyer-alert marketing sequence and test unsubscribe
- [ ] Explicit approval to publish, then configure production AO_QUICK_CHECK_* env and redeploy
- [ ] Observe first eight weeks: unique firms, sourced enquiries, quotes, orders and gross margin; compare with manual review hours

## Cost
Designed for **£0 additional fixed monthly service subscription** while within the user's existing Vercel Hobby and Airtable plan limits. Actual usage/storage allowances should be verified before publishing. No paid Tally, Make or Zapier account is required. Do not promise free capacity indefinitely.

## SEO
Public URL, canonical, title, meta description and internal links staged in home, S7-300 guide and the obsolescence audit page. release.py generates its sitemap entry automatically on a full site build. No indexing or real customer traffic before production approval.

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
- Private drafts are generated in the review dashboard but NO customer or owner emails are automatically sent in preview; operational email automation is gated until production approval.
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
- [x] Owner preview test AQC-F1E5F345 saved three correctly identified part numbers in a single Airtable row
- [ ] Run accessibility keyboard check
- [ ] Privacy wording reviewed for UK GDPR, retention policy and Formspree/Airtable processors
- [ ] Configure owner notifications (not marketing) if desired
- [ ] Customer acknowledgement workflow if desired; never claim it exists before configured
- [x] Honeypot, server validation, HMAC-hashed five-requests-per-IP-per-day limit (best effort under concurrent requests)
- [ ] Decide whether to enable the optional buyer-alert marketing sequence and test unsubscribe
- [ ] Explicit approval to publish, then configure production AO_QUICK_CHECK_* env and redeploy
- [ ] Observe first eight weeks: unique firms, sourced enquiries, quotes, orders and gross margin; compare with manual review hours

## Cost
Designed for **£0 additional fixed monthly service subscription** while within the user's existing Vercel Hobby and Airtable plan limits. Actual usage/storage allowances should be verified before publishing. No paid Tally, Make or Zapier account is required. Do not promise free capacity indefinitely.

## SEO
Public URL, canonical, title, meta description and internal links staged in home, S7-300 guide and the obsolescence audit page. release.py generates its sitemap entry automatically on a full site build. No indexing or real customer traffic before production approval.

---
## Implementation update: customer-to-order workflow
- Public customer page: /obsolescence-check.html. Private admin: /quick-check-admin.html; log in with existing AO deal-desk key. Private API: /api/quick-check-admin reuses the existing /api/network-signup function, preserving the Vercel Hobby 12-function cap.
- Airtable "Obsolescence Quick Checks": lead pipeline, approval state, manual quote value, recorded order gross profit, report draft, timestamps and pseudonymous daily rate limit token. "Lifecycle Verification Cache": exact part number, official manufacturer URL, verified date, successor, notes and supply channel.
- The private dashboard reads new enquiries and saved verified cache records. Cache must be from the official manufacturer and less than 90 days old. "Listed" from an old cached record is NEVER proof of current stock. All unverified statuses become "Unknown — check".
- Report is automatically drafted but cannot be copied or printed until explicitly approved by marking "Summary ready". Unknown entries may be approved only with an explicit owner acceptance and 40+ characters of investigation notes. This allows honest results even when the manufacturer gives no verified answer.
- Print / Save PDF uses the browser print dialogue on the approved report. Copy to Outlook (no send) and then mark Summary sent to record an actual manual email. The dashboard tracks open leads, quotes, orders and gross profit.
- A1 acknowledgement email is coded for Resend but turned OFF in preview and OFF in production until explicitly enabled. Owner operational Formspree notification also is OFF. A3/A4/A5 optional follow-up drafts are never sent automatically; available for manual copy only when marketing consent exists and a summary has already been manually sent.
- Signed unsubscribe links point to /quick-check-unsubscribe.html and /api/quick-check-unsubscribe. Clicking confirms withdrawal of the marketing-only Airtable consent; no further marketing is permitted from that contact without fresh permission.
- Analytics uses AO's optional-consent tracking; only the permitted generate_lead event name and lead type, not customer details or part numbers, are shared.
- Daily rate limit keyed by an HMAC of IP address and date. Raw IP is NOT stored. Five accepted requests per IP/day. This check is not fully atomic under simultaneous requests.

## Manufacturer-verified starter records (checked 13 Oct 2026)
- Allen-Bradley 1747-L542: Discontinued. Exact Rockwell product page: https://www.rockwellautomation.com/en-us/products/details.1747-L542.html . No drop-in replacement asserted.
- Mitsubishi FX2N-48MR-ES/UL: Discontinued, with manufacturer-suggested replacement FX5U-64MR/ES (engineering work may be required). Manufacturer table: https://us.mitsubishielectric.com/fa/en/support/parts/legacy-products/programmable-controllers/fx2n-fx2nc .
- Omron CJ2M-CPU31: Phase-out based on UK product page's future discontinuation notice. UK manufacturer source: https://industrial.omron.co.uk/en/products/CJ2M-CPU31 . Recheck the original regional notice before sharing; regional dates may vary.
- Siemens 6ES7315-2AG10-0AB0 stays Unknown — check, as the official current SiePortal page needs interactive verification. Never copy a status from a dealer page.

## Configuration required AFTER explicit launch approval
Production-only variables:
- AO_QUICK_CHECK_BASE_ID, AO_QUICK_CHECK_TABLE_ID, AO_QUICK_CHECK_CACHE_TABLE_ID, AO_QUICK_CHECK_ENABLED=true.
- Existing AIRTABLE_ACCESS_TOKEN and AO_DEAL_DESK_KEY remain server-side secrets.
Optional A1 email: RESEND_API_KEY, AO_QC_FROM_EMAIL, AO_QC_AUTOREPLY_ENABLED=true, plus a verified domain. Preview never sends.
Optional owner notifications: AO_QC_OWNER_NOTIFY_ENABLED=true and optionally FORMSPREE_QC_ENDPOINT. Preview never sends.
No auto marketing emails are enabled. The signed unsubscribe path must be tested before the manually drafted optional messages are actually sent.

## Cost and limits
- No new Tally, Zapier or Make subscription is required.
- Airtable Free currently limits to 1,000 records per base AND 1,000 API calls per workspace per month; the AO Network base shares its record capacity across buyer, supplier, pilot, cache and check tables. Monitor usage.
- Resend Free currently advertises 3,000 transactional emails/month (100/day), subject to domain/account verification. Not connected yet.
- The AO Vercel project is currently on Hobby (12 serverless functions/deployment). Vercel states Hobby is intended for personal non-commercial use, so a suitable commercial hosting plan may be required before live launch. Do not promise zero extra monthly cost without that review.

## Two-week acceptance checklist
| Target | Owner | Acceptance |
|---|---|---|
| 13 Oct | Assistant | Landing form, private dashboard, protected API, lifecycle cache, drafts, PDF print and unsubscribe built |
| 13–14 Oct | Assistant | All automated tests passed in Vercel preview; no production release |
| 14 Oct | Rob | Visually inspect mobile and desktop page, private review workflow |
| 14–15 Oct | Rob + assistant | Test an acknowledged mock request, report approval, PDF print and signed unsubscribe |
| 15 Oct | Rob | Check privacy wording/retention, DPA terms for data processors and email provider |
| 15–16 Oct | Rob | Review sender domain setup and approve A1/owner operational notifications |
| 17 Oct | Rob | Explicit production release sign-off (not before) |
| 20 Oct | Rob | Review first five genuine enquiries and check manual workload |
| 27 Oct | Rob | Two-week revenue review: companies, sourcing quotes, orders, gross profit |

## Eight-week success scorecard
Count unique factory enquiries, requirements for sourcing, manufacturer statuses verified from cache, follow-up quotes, won orders, gross margin and engineer time spent. Do not treat test submissions or vanity website traffic as sales. A useful pilot should generate actual buying enquiries without becoming unpaid manual engineering work.


## Approved sender and manual Outlook report handoff (13 October)
- Owner confirmed: **automatic service acknowledgements must come from Automation Outlet <info@automation-outlet.co.uk>**. The API now enforces this sender and sets Reply-To to info@automation-outlet.co.uk; callers cannot override the address with form input.
- Resend's Idempotency-Key uses the AQC request reference to suppress duplicate A1 email sends across retries for the provider's supported retention window. Resend sends on behalf of the verified domain; this is not a Microsoft Outlook Sent Items message.
- The private Quick Check review desk now has an **Open approved report in Outlook** action: it launches an Outlook web compose draft with recipient, subject and short text body prefilled after engineer approval. It never clicks Send. Reports longer than the safe deep-link length must be copied into an Outlook draft manually using **Copy report**.
- The currently connected Outlook account was confirmed as info@automation-outlet.co.uk.
- Vercel project environment inventory does **not** currently contain a RESEND_API_KEY or AO_QC_AUTOREPLY_ENABLED flag. The configuration cannot send automatic customer acknowledgements at this point. Do not set AO_QC_AUTOREPLY_ENABLED=true until the operator has completed vendor registration, verified the automation-outlet.co.uk domain, added the key to Vercel, and tested one controlled delivery.
- For acknowledgement enablement, the required config is RESEND_API_KEY (secret) and AO_QC_AUTOREPLY_ENABLED=true (production only). Sender and Reply-To are pinned in code; AO_QC_FROM_EMAIL is no longer used.
- Initial email provider setup requires a Resend account and DNS ownership proof in the domain DNS host, currently believed to be IONOS. Add the exact DNS records given by Resend, preserving existing Microsoft 365 MX and SPF/DKIM records rather than guessing or overwriting them. The owner must approve DNS changes and the first test send.
- No change has been merged into main or published to the production AO website by this work.

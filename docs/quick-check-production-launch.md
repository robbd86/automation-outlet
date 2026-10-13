# Automation Outlet Quick Check — production launch checklist
Prepared on 2026-10-13. **NOT deployed to production.** Do not merge until explicit go-live approval.

## Completed
- Staging form, consent capture, official manufacturer-source matching, 100-part evidence catalogue and AO Airtable storage.
- Actual staging form -> Airtable -> Resend -> Outlook test passed (AQC-450AB047). Owner validated manual report approval and Outlook draft (AQC-17EE7163).
- Verified Resend sending domain, automation-outlet.co.uk, in EU region. Existing Microsoft 365 mailbox unaffected.
- Production Vercel Airtable IDs pre-configured to point to the same AO Network base/tables.
- Production switches AO_QUICK_CHECK_ENABLED=false, AO_QC_AUTOREPLY_ENABLED=false, AO_QC_OWNER_NOTIFY_ENABLED=false.
- New production-only buyer alert routine prepared: sends separate internal Outlook notification via Resend, with part list, urgency and reference. Existing customer acknowledgement remains separate. No automatic technical report or marketing.
- Tests include validation, admin access, preview safety, rate limiting, source expiry, acknowledgement and owner-alert flows. Final CI build required on latest commit.

## Mandatory launch blockers
1. REPLACE the exposed test Resend API key. The existing domain-restricted key (named "AO Quick Check — domain-restricted website sending") was shown in conversation and must not be trusted for production. Connected Resend deletion is irreversible and will stop services using it: ask owner for explicit confirmation after double-check before deletion.
2. Privately create a fresh domain-restricted "sending access" Resend key through account UI, and securely configure it in Vercel as production RESEND_API_KEY. Never paste the replacement key into a chat, email, GitHub commit or screenshot. Use separate test and production keys.
3. Run an end-to-end test for internal buyer alert and customer acknowledgement using the new key and approved internal-only contact details, before allowing any customer deliveries. Production flags must stay OFF until sign-off.
4. Check privacy notice, processor contractual arrangements, data retention, separate marketing consent and UK PECR before public traffic.
5. Confirm current Vercel plan is appropriate for commercial use and Airtable record/API usage limits will not cause loss of enquiries.
6. Check live robots/noindex for admin and opt-out pages, sitemap for public page only, analytics consent and existing store/checkout regression.
7. Verify reports are human-approved, local/revision-specific manufacturer evidence is reviewed, and supply is never guaranteed by lifecycle status.
8. Confirm owner notification inbox receives new buyer enquiries and machine-down urgency is visible. Verify error logs and safe fallback contact details.
9. Obtain owner explicit go-live approval; only then merge PR #60, deploy and enable appropriate production switches.

## Expected production journey
Buyer submits 1–5 parts -> Airtable saves AQC reference -> separately gated owner alert + transactional customer acknowledgement -> private source review and report approval -> Outlook draft/PDF and buyer quote route -> quote/order/profit tracking.

## Release change control
Staging branch: feature/obsolescence-quick-check
Draft PR: https://github.com/robbd86/automation-outlet/pull/60
No automatic publication, secret disclosure, unsolicited marketing or unapproved manufacturer status emails.

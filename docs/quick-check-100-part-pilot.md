# AO Quick Check — 100-part manufacturer evidence proof of concept
Prepared 13 October 2026. **Staging branch only; no production deployment.**

## Executive status
- 100 unique, exact-order-code pilot cases: 74 Mitsubishi, 11 Allen-Bradley (Rockwell), 15 Siemens.
- 85 cases have **dated manufacturer-published source evidence**: 74 from the US Mitsubishi FX2N/FX2NC legacy model table; 11 exact Rockwell product pages.
- 15 Siemens cases are **research candidates**, not manufacturer-verified lifecycle claims. The paid Siemens Product Information API is not connected.
- These are deliberately selected records from manufacturer-published sources. They are NOT a representative random sample, so **85/100 must not be presented as the real-world automatic verification rate**.
- Mitsubishi records concern US manufacturer product documentation and Rockwell records are from US product pages. Regional status, revision/firmware and technical applicability must be checked for UK customers.
- All 85 source snapshots expire after 90 days; anything older displays Unknown — check unless renewed via Airtable engineering verification.
- The snapshot is a version-controlled module in GitHub, not 100 Airtable rows. Newly verified unlisted codes are saved in Airtable and reused across enquiries (up to current workspace limits).

## Official manufacturer sources
Mitsubishi discontinued FX2N/FX2NC order codes and suggested successors:
https://us.mitsubishielectric.com/fa/en/support/parts/legacy-products/programmable-controllers/fx2n-fx2nc/
Note: this explicitly says suggested products are not necessarily drop-in, and program/wiring/system changes may be required.

Rockwell individual product records:
https://www.rockwellautomation.com/en-us/products/details.1747-l542.html
https://www.rockwellautomation.com/en-us/products/details.1747-l552.html
https://www.rockwellautomation.com/en-us/products/details.1747-l553.html
https://www.rockwellautomation.com/en-us/products/details.1747-l541.html
https://www.rockwellautomation.com/en-us/products/details.1746-ib16.html
https://www.rockwellautomation.com/en-us/products/details.1746-ob16.html
https://www.rockwellautomation.com/en-us/products/details.1756-enbt.html
https://www.rockwellautomation.com/en-us/products/details.1756-l71.html
https://www.rockwellautomation.com/en-us/products/details.2711p-t7c4d8.html
https://www.rockwellautomation.com/en-us/products/details.2711p-t10c4d8.html
https://www.rockwellautomation.com/en-us/products/details.1756-enbt-cc.html

Official Siemens API access requirements:
https://developer.siemens.com/product-information-api/getting-started.html

## Engineering data flow
1. Customer enters one to five part numbers, manufacturer, quantity, urgency and buying intent at /obsolescence-check.html.
2. Original consented request is stored in the existing "Obsolescence Quick Checks" Airtable table. Customer gets A1 acknowledgement through the separate Resend configuration; preview sends acknowledgements only to the AO test inbox.
3. Private dashboard at /quick-check-admin.html uses the existing AO deal-desk admin key. It loads engineer-verified Airtable cache and the 100-part exact-code source snapshot, preferring saved engineer overrides.
4. Match by the complete canonicalized exact part number AND manufacturer. Unknown/Other may match exact code, but ambiguous codes must be checked for manufacturer before approval.
5. Enforce official manufacturer HTTPS source, lifecycle vocab, verified date (less than 90 days) and correct manufacturer. No family-level inferred statuses. Never claim AO stock availability from the lifecycle database.
6. For an unmatched Allen-Bradley code, the private "Look up Rockwell lifecycle" button attempts to retrieve the exact official product page, requiring matching Unique Product Identifier and explicit lifecycle status. A result is a **research suggestion only**; owner must inspect the actual source and deliberately save it.
7. For Siemens, exact order codes are Unknown — check until independently verified with official sources. The Siemens API needs paid credentials and permitted licensing; never bypass access controls or scrape unsupported endpoints.
8. The report is drafted with source, checked date, any published successor, preliminary **supply** risk and clear uncertainty warnings. It cannot be copied, printed, or emailed until the engineer records explicit report approval. Unknown cases require notes and explicit acknowledgment.
9. Sourcing conversion: customers see a "Request sourcing quote" link after successfully submitting the form; the part number is prefilled on /obsolete-parts-sourcing.html. The report also directs customers to request a quote (no inventory promise).
10. Owner records real research minutes, quote value, order gross profit and outcome status. No automatic marketing unless separately consented, and no automatic sending of technical reports.

## Acceptance cases
| Code | Make | Expected result from empty Airtable cache |
|---|---|---|
| FX2N-48MR-ES/UL | Mitsubishi | Discontinued; published FX5U-64MR/ES suggested successor, compatibility unverified |
| 1747-L552 | Allen-Bradley | Discontinued with an official Rockwell record; availability Not checked |
| 1756-L71 | Allen-Bradley | Mature (vendor Active Mature), no stock claim |
| 6ES7315-2AG10-0AB0 | Siemens | Unknown — check; research queue |
| 6ES7416-3ES06-0AB0 | Siemens | Unknown — check; research queue |
| FX2N-48MR-ES/UL-FAKE | Mitsubishi | No match, Unknown — check |
| 1747-L552 marked Siemens | Siemens | No match, Unknown — check |
| Any seeded sourced code checked after Jan 2027 | All | Expired; Unknown — check until reverified |

## Commercial metrics and decision gate
Dashboard shows:
- Catalog coverage: total, sourced, currently fresh and outstanding verification.
- Actual enquiry coverage: total submitted part rows, rows with current source evidence, rows awaiting research, and rows automatically resolved from the source snapshot.
- Outcomes: unique leads, quoting activity, orders, gross profit and manually logged engineer research minutes.

**Review after 20 genuine buyer enquiries or 8 weeks, whichever comes first.** Do not count internal testing. Evaluate actual minutes per order, coverage by manufacturer, proportion requesting spares vs lifecycle-only checks, quote conversion, gross profit and missing-data reasons. Do not purchase Siemens API keys or third-party enrichment subscriptions unless genuine buying demand supports the cost.

## Non-features deliberately omitted
- No unsupported claim of nationwide live stock, guaranteed sourcing or drop-in successor compatibility.
- No bulk scraping of Siemens gated systems, no unauthorized manufacturer API access, no large-scale paid dataset.
- No unreviewed lifecycle status email; public forms remain acknowledgement-only until report approval.
- No new production release, no alteration of checkout, no seller-facing campaigns.
- No automatic repeated re-verification yet. 90-day expiry forces review; recurring source monitoring should be considered only after evidence accuracy is proven.

## Production readiness
- Keep the staging branch PR open until user approval.
- Preview tests: access private desk with existing admin key, inspect 100-part coverage stats, run the five representative checks above, try quote prefill, manually approve/print report and record research minutes.
- API research may be blocked by the Rockwell server; this is handled as **not confirmed** and should not imply verified results.
- Before public launch confirm email sender API key rotation/security, production environment, GDPR retention, alert configuration, and appropriate Vercel commercial hosting.

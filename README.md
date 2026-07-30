# Automation Outlet — website (multi-page)

Static site, no build step needed by Vercel — it serves the .html files directly.

## Pages
| URL | Purpose |
|---|---|
| `/` | Landing page — hero, two paths, trust, links out. No forms. |
| `/sell-surplus.html` | Sell to us — what we buy, how it works, **multi-line sell form**, brands |
| `/buy-stock.html` | Buy — why buy from us, brands, eBay link |
| `/obsolete-parts-sourcing.html` | Obsolete sourcing + **part request form** |
| `/services.html` | Services hub → links to detail pages |
| `/contact.html` | General **quote form** |
| `/sell-surplus-plcs.html` | SEO detail: sell PLCs |
| `/sell-control-panels.html` | SEO detail: sell panels / panel builds |
| `/factory-clearance.html` | SEO detail: clearances |
| `/plc-programming.html` | SEO detail: PLC & HMI programming |
| `/bench-testing.html` | SEO detail: bench testing |

## Editing
`build.py` generates index, sell-surplus, buy-stock, services and contact from the
blocks in `_blocks/`. Run `python3 build.py` after editing it.
The five SEO detail pages are currently edited directly.

## Forms
All three post to Formspree `xqevvvll`, each with a distinct `_subject` so enquiries
arrive pre-sorted: sell list / part sourcing / general quote.

## Cutover checklist
1. Remove `noindex` from ALL html files (search `REMOVE AT LAUNCH`)
2. Push, confirm test URL good
3. Vercel: old project → Settings → Domains → remove both domains;
   new project → add `www.automation-outlet.co.uk` + `automation-outlet.co.uk`
4. Check the live domain loads v2
5. Search Console → resubmit sitemap.xml, request indexing on key pages
6. Keep old project 2 weeks as rollback

Rollback = move domains back to the old project (~1 min).

## Production repository

This repository now contains the production Automation Outlet website, including:

- public multi-page website and SEO pages
- Formspree-backed general and fallback enquiries
- structured seller portal and private deal desk
- public stock catalogue and private stock manager
- Vercel serverless API functions

Vercel builds with `python3 build.py && python3 patch_stock.py && python3 release.py`.

Required Vercel environment variables:

- `AO_GITHUB_TOKEN`
- `AO_DEAL_DESK_KEY`
- `AO_GITHUB_REPO=robbd86/automation-outlet-site`

The private repository remains the data store for stock and seller records. Never commit tokens or passwords.

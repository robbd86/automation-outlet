# Seller Portal and Acquisition Deal Desk

This release turns the existing sell-to-us form into a structured acquisition system.

## What it does

- Captures the seller's preferred route: cash purchase, best-option assessment, or revenue share/consignment.
- Collects equipment type, manufacturer, part number, condition, quantity, seller expectations, urgency and logistics.
- Creates a private GitHub Issue for every submission.
- Gives each enquiry an Automation Outlet reference.
- Provides a private `/deal-desk.html` page for:
  - status and priority
  - resale estimate
  - cash-offer recommendation
  - revenue-share percentage
  - follow-up date
  - internal notes
  - a cash-offer calculator
- Preserves changes as GitHub issue history.

## Required Vercel environment variables

Add these in **Vercel → Project → Settings → Environment Variables** for Production and Preview:

| Variable | Purpose |
|---|---|
| `AO_GITHUB_TOKEN` | Fine-grained GitHub token with **Issues: Read and write** access to `robbd86/automation-outlet-site` only |
| `AO_DEAL_DESK_KEY` | A long, unique password used to open the internal deal desk |
| `AO_GITHUB_REPO` | Optional. Defaults to `robbd86/automation-outlet-site` |
| `AO_ALLOWED_ORIGIN` | Optional. Set to `https://www.automation-outlet.co.uk` to restrict public submissions to the live site |

After adding or changing an environment variable, redeploy the Vercel project.

## GitHub token setup

Create a fine-grained personal access token restricted to the private website repository:

- Repository access: `robbd86/automation-outlet-site`
- Repository permission: **Issues — Read and write**
- No Contents permission is required by the portal.

Store the token only in Vercel. Never add it to this repository or to browser JavaScript.

## Opening the deal desk

Visit:

`https://www.automation-outlet.co.uk/deal-desk.html`

Enter the value configured as `AO_DEAL_DESK_KEY`. The key is kept in browser session storage only and is removed when the desk is locked or the tab session ends.

## Safe fallback

Until the Vercel variables are configured, seller submissions fall back to the existing Formspree email route. Once configured, submissions create private acquisition records automatically.

## Build

Vercel now runs:

```bash
python3 build.py
```

The generated static pages remain the deployment output, while `/api/deal-desk.mjs` is deployed as a Vercel Function.

# Buyer and supplier network signup setup

The Buyer Alerts and Supplier Network forms submit to `/api/network-signup`. The Vercel function validates each signup, upserts it into Airtable by lower-cased email address, and then sends the existing Formspree notification. A Formspree failure does not turn a successfully stored Airtable signup into an error.

## Airtable target

Use the existing **Automation Outlet Network** base with these tables:

- Buyers
- Suppliers

The field names and select choices in the existing tables already match the website forms. Do not put the Airtable token in HTML or browser JavaScript.

## Airtable personal access token

For the current preview integration test, the Airtable personal access token is configured with:

- `data.records:read`
- `data.records:write`
- `schema.bases:read`

Under **Access**, allow **all current and future bases in My First Workspace** so the token can reach the verified Automation Outlet Network base used by the Vercel API route.

The token itself remains server-side in Vercel as `AIRTABLE_ACCESS_TOKEN` and must never be exposed in HTML or browser JavaScript.

## Vercel environment variables

Add these to both **Preview** and **Production** in Vercel, then redeploy:

| Variable | Value |
|---|---|
| `AIRTABLE_ACCESS_TOKEN` | The Airtable personal access token |
| `AIRTABLE_BASE_ID` | The selected Automation Outlet Network base ID |
| `AIRTABLE_BUYERS_TABLE_ID` | The Buyers table ID |
| `AIRTABLE_SUPPLIERS_TABLE_ID` | The Suppliers table ID |
| `FORMSPREE_NETWORK_ENDPOINT` | Optional; defaults to the existing `https://formspree.io/f/xqevvvll` endpoint |

`AO_ALLOWED_ORIGIN` remains optional. It can contain a comma-separated list of extra allowed origins. The production domains and same-origin Vercel branch previews are accepted automatically.

Environment-variable changes only apply to new Vercel deployments. After changing the Airtable token or IDs, trigger a fresh deployment of this feature branch before testing its preview alias.

## Preview test

1. Add the required Airtable variables to the Vercel Preview environment.
2. Deploy this branch and open its Vercel preview.
3. Submit one buyer test and one supplier test.
4. Confirm the unchanged success messages appear.
5. Confirm the records appear in the correct Airtable tables and the Formspree emails arrive.
6. Submit the same email again with a changed company or preference and confirm Airtable updates the existing record rather than creating a duplicate.

Do not merge until both preview submissions and the duplicate test pass.

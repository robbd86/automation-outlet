# AO Marketplace — Stage 2 isolated authentication setup

Status: prepared, NOT provisioned or deployed.

## Scope and cost gate
- Use a new Supabase Free project named ao-marketplace-dev in a UK/EU region if available.
- Confirm organization plan is Free, unused free-project capacity exists, and no paid add-on is selected. Stop if payment or upgrade is required.
- Do not use an existing AO or customer database. No production Vercel variables, existing Stripe, GitHub, Airtable or Blob credentials.
- Do not enable auth on the original Vercel project's shared preview. Existing preview stays network-disabled with fictional listings.
- Only use a distinct authenticated development host or localhost; verify deployment protection before any hosted tests.

## Provisioning sequence
1. Create the free project. Record the project ref and chosen region, not passwords or secret keys in this public repository.
2. Inspect the empty project and review schema-draft.sql; apply once only, after confirming target identity.
3. Run database permission tests with anonymous, seller A, seller B and service/admin identities. Verify zero cross-seller writes or private enquiry reads. Verify anonymous reads exclude drafts, unapproved, expired and revoked sellers. Verify direct self-publish, seller approval, and moderation writes are denied. Verify submitted listings cannot be changed before moderation. Roll back or remove test fixtures.
4. Expose only the marketplace schema using Supabase Data API settings after the policy review and tests. Never expose auth.users or secret keys. Review all generated grants.
5. Configure email/password auth: enable confirm email, minimum 12 character password, narrow exact callback URLs, and rate limits. Configure CAPTCHA before public signups. Keep public registration disabled until a real protected development host exists and tests pass.
6. Use the official Supabase JS v2 client with a reviewed pinned release and development project publishable key only. The auth-client.mjs adapter requires a verified user for profile operations and ignores caller-provided identity/role/approval fields. Test using node --test docs/marketplace/auth-client.test.mjs.
7. Implement UI and callback event handling, including PASSWORD_RECOVERY and sign-out/session expiry; use PKCE and the provider SDK's documented callback exchange. Test email confirmation, recovery, duplicate signup, bad credentials and account switching with authorised test addresses only. Default Supabase SMTP may only send to team addresses. Local Supabase/Mailpit is another option for email tests. No customer emails.
8. Configure private image storage and scoped upload policies in a subsequent stage; validate content server-side and prevent private images becoming publicly accessible.
9. Implement server-only moderation, enquiry sending with abuse controls, public wanted feed and listing lifecycle endpoints; service credentials only in isolated server environment if necessary.
10. Only after an isolated deployment is verified, add the actual account UI and database integration. No live launch until explicitly approved.

## References
- https://supabase.com/pricing
- https://supabase.com/docs/guides/auth/passwords
- https://supabase.com/docs/guides/auth/auth-smtp
- https://supabase.com/docs/guides/auth/testing-auth-flows
- https://supabase.com/docs/guides/api/using-custom-schemas
- https://supabase.com/docs/guides/database/postgres/row-level-security
- https://supabase.com/docs/guides/getting-started/api-keys

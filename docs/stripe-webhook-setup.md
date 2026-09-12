# Stripe sandbox webhook

`POST https://www.automation-outlet.co.uk/api/stripe-webhook` handles only
`checkout.session.completed` for paid, complete, own-account AO sandbox sessions.
The endpoint uses a Web Standard request to preserve raw bytes and Stripe's
official SDK to verify `Stripe-Signature` with a five-minute timestamp tolerance.

## Configuration

Use the existing Vercel project and its existing Stripe sandbox:

- `STRIPE_SECRET_KEY`: must begin `sk_test_`; live keys fail closed.
- `STRIPE_WEBHOOK_SECRET`: signing secret for this exact sandbox destination.
- Subscribe the destination to `checkout.session.completed`.
- Redeploy after changing environment variables. A production Vercel deployment
  still runs **Stripe sandbox only**; Vercel's environment name does not enable live payments.

Never put credentials into source, issues, screenshots, command arguments or logs.
No new GitHub permissions or database credentials are required.

## What is recorded

After signature verification, the handler retrieves the Checkout Session using
the test key and checks its ID, test mode, AO sandbox metadata and paid/complete
status again. It updates only these two metadata keys on that existing session:

| Key | Value |
| --- | --- |
| `ao_webhook_status` | `paid_test_acknowledged_v1` |
| `ao_stock_action` | `unchanged` |

The session and its existing Stripe line items remain the test payment record.
The checkout already attaches `ao_stock_id` and `part_number` to each Stripe
product. Customer details and line items are not copied into the public source
repository, logs or a second order store. The private GitHub issue-based stock
and seller/deal-desk records are not modified. No email or fulfilment is triggered.
This is a durable Stripe acknowledgement, **not an AO order-management system**.

## Retry and concurrency behaviour

The session ID is the deduplication identity, including when two different event
IDs describe the same session. An acknowledged session returns `duplicate: true`
without a write. Initial writes use a fixed session-specific Stripe idempotency
key and identical metadata values. Concurrent requests may receive a retryable
error while Stripe processes that key. Repeating the write after key expiry still
assigns the same values on the same object; it cannot create another order.
A write that succeeds before a network timeout is recognised on the next read.

This deliberately does not use an in-memory set or GitHub issue search followed
by creation, neither of which prevents duplicate work across Vercel instances.
The marker must not be reused as an exactly-once fulfilment or stock-write lock.

## Responses and validation

- `405`: unsupported method.
- `400`: invalid signature, malformed event or prohibited live/account context.
- `413`: signed body exceeds 1 MiB.
- `200` with `ignored`: unsupported event, non-AO session or unpaid completion.
- `200` with `recorded` / `duplicate` and `stockChanged: false`: durable acknowledgement.
- `502` / `503`: configuration, verification or Stripe storage failure; retry required.

Run `npm ci` and `npm test`. Tests cover signatures,
raw-byte preservation, tampering, stale timestamps, live-key/event rejection,
ownership and paid-status checks, repeat and concurrent deliveries, failed writes,
lost write responses, and the absence of any stock/issue creation requests.

After deployment, check GET and unsigned POST rejection, then resend a real paid
AO sandbox `checkout.session.completed` event in Stripe Workbench. Confirm a 200
recorded response, the two session metadata values, and a duplicate response on
resend. Compare catalogue quantities before and after. Generic Stripe CLI fixtures
without `ao_environment=sandbox` are intentionally ignored and do not validate the
paid AO path. A successful build alone does not prove real webhook delivery.

## Before live mode

1. Finish a real signed sandbox delivery and retry check against the deployed
   destination; retain the event and deployment evidence.
2. Design a durable AO order ledger with a unique Checkout Session identity and
   atomic order/stock updates. Existing GitHub issue PATCH operations are not a
   safe concurrency mechanism for stock reduction. Test simultaneous checkouts,
   overselling, retries, partial failures, refunds and cancellations.
3. Define fulfilment, shipping/tax rules, customer notifications, reconciliation
   and refund handling. Keep personal order data in an access-controlled store.
4. Either restrict checkout to immediate payment methods or implement and test
   `checkout.session.async_payment_succeeded` and failure handling. An unpaid
   `checkout.session.completed` event is currently ignored.
5. Deliberately update the checkout, verification and webhook test-only guards;
   configure separate live keys, live destination and its own signing secret.
   Merely swapping keys currently disables the integration.
6. Run a controlled live purchase, refund and inventory reconciliation, verify
   webhook failure monitoring, and only then enable the public payment entry point.

References: [Stripe webhooks](https://docs.stripe.com/webhooks),
[Checkout Session metadata updates](https://docs.stripe.com/api/checkout/sessions/update),
[Vercel Web Standard handlers](https://vercel.com/docs/functions/runtimes/node-js).

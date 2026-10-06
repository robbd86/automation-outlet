# AO PLC Intelligence website foundation

AO PLC Intelligence is implemented inside the existing static Automation Outlet/Vercel application. It deliberately does not change the existing store, stock manager, seller portal, admin key, checkout or Python PLC analysis engine.

## Public and private routes

- `/plc-audit` — public product/SEO page.
- `/plc-audit/upload` — customer upload flow; noindex.
- `/plc-audit/dashboard` — customer audit list; noindex.
- `/plc-audit/audits/:id` — customer-owned audit result; noindex.

Vercel rewrites those clean routes to the static HTML files in the repository. The dynamic audit route is resolved client-side and all audit data is loaded through the authenticated server API.

The public API contract remains `/api/plc-audit`. The Vercel Hobby deployment was already using the 12-function allowance, so this route is rewritten internally to the existing `api/deal-desk.mjs` serverless function with `plcAudit=1`. The deal-desk function delegates to `lib/plc-audit-handler.mjs`; all existing deal-desk, agent and photo-agent behaviours remain intact.

## Customer identity foundation

The existing Automation Outlet site has an admin-key authentication pattern but no customer-account login system. PLC Intelligence therefore uses a separate signed, HttpOnly customer session cookie (`ao_plc_session`) backed by `AO_PLC_SESSION_SECRET`.

The cookie contains only an opaque `accountId`, issue/expiry timestamps and an HMAC signature. Every customer audit API read, report request and delete operation checks `AuditJob.accountId` server-side. A guessed or edited audit ID does not grant access to another account.

This is intentionally isolated from `AO_DEAL_DESK_KEY` so customer traffic never uses the admin password. A full email/account login can replace the session adapter later without changing the AuditJob ownership model.

## AuditJob persistence

To match the existing site architecture, AuditJobs are persisted as private GitHub Issues in `AO_GITHUB_REPO`, using the label `plc-audit-job` and an embedded base64 JSON record. PLC project bytes are never stored in GitHub.

Core fields:

- `id`
- `accountId`
- `profile`
- `status`
- `filename`
- `storagePath`
- `detectedPlatform`
- `detectedProjectVersion`
- `engineVersion`
- `createdAt`, `startedAt`, `completedAt`
- `snapshotResult`
- `reportArtifact`
- `error`
- `retention`
- transient `workerClaim` lease metadata while a worker owns the job

Statuses: `CREATED`, `UPLOADING`, `QUEUED`, `ANALYSING`, `REVIEW_REQUIRED`, `COMPLETE`, `FAILED`, `DELETED`.

## Private Blob upload architecture

PLC files do not pass through a Vercel function request body.

1. Browser sends only filename, file size and content type to `/api/plc-audit?action=create-upload`.
2. Server creates an opaque AuditJob ID and opaque Blob pathname.
3. Server requests short-lived Vercel Blob delegation material using `BLOB_READ_WRITE_TOKEN`.
4. Server returns a presigned PUT URL scoped to that pathname, upload type and maximum size.
5. Browser PUTs the PLC project directly to the private Blob store.
6. Browser confirms upload and the job becomes `QUEUED`.

Permanent Blob credentials are never returned to the browser and private Blob object URLs are not persisted in customer-visible data.

A private Vercel Blob store named `ao-plc-intelligence-private` is provisioned for the existing Automation Outlet project in region `lhr1`. Vercel injects its `BLOB_READ_WRITE_TOKEN` into production, preview and development.

## Worker service boundary

The Python engine remains separate. A future worker uses `AO_PLC_WORKER_KEY` against the server boundary:

- `GET /api/plc-audit?action=worker-next` — claims the oldest queued (or expired-lease) job, returns a short-lived private project download URL, and returns a one-time worker claim token.
- `POST /api/plc-audit?action=worker-update` — publishes `COMPLETE`, `REVIEW_REQUIRED` or `FAILED` plus the typed Snapshot result and optional private report artifact pathname. The request must include the current `claimToken`.

Worker claims are time-limited and the stored job contains only a SHA-256 hash of the claim token. A crashed worker's `ANALYSING` job becomes claimable again after the lease expires. A stale worker cannot publish over a newer worker claim. This prevents stale-result corruption while the lightweight GitHub-Issues persistence layer is in use.

The GitHub-Issues store is intentionally a foundation matching the existing website architecture, not a transactional queue. If the service later runs many parallel workers at meaningful volume, move audit state/queue claiming to a transactional datastore rather than treating GitHub Issues as an exactly-once queue.

The website contains no PLC parser.

For development/preview, set `AO_PLC_ANALYSIS_ADAPTER=mock`. Confirming an upload then generates a deterministic mock SnapshotResult so the complete website flow can be tested without the Python worker. The live production environment does not use the mock adapter.

## Private reports

`reportArtifact` stores only a private Blob pathname and metadata. Customer report downloads call `/api/plc-audit?action=report-url&id=...`; ownership is checked before the server issues a short-lived signed GET URL.

## Required environment variables

Existing variables remain unchanged:

- `AO_GITHUB_TOKEN`
- `AO_GITHUB_REPO`
- `AO_ALLOWED_ORIGIN` (recommended in production)

PLC Intelligence adds:

- `AO_PLC_SESSION_SECRET` — at least 32 random characters; configured as a sensitive Vercel variable.
- `AO_PLC_WORKER_KEY` — long random worker/service credential; configured as a sensitive Vercel variable and must also be supplied to the Python worker when connected.
- `BLOB_READ_WRITE_TOKEN` — supplied by the connected private Vercel Blob store.

Optional:

- `AO_PLC_ANALYSIS_ADAPTER=mock` — configured only for preview/development while the Python worker is disconnected.
- `AO_PLC_MOCK_ENGINE_VERSION` — label shown for mock result generation.
- `AO_PLC_RETENTION_DAYS` — defaults to 30.
- `AO_PLC_MAX_UPLOAD_BYTES` — defaults to 250 MiB.
- `AO_PLC_SESSION_TTL_SECONDS` — defaults to 30 days.
- `AO_PLC_WORKER_LEASE_SECONDS` — defaults to 1800 seconds (30 minutes), clamped between 60 seconds and 6 hours.

## Remaining service configuration

The website/storage/session foundation is configured. Production Snapshot jobs remain `QUEUED` until the separate Python analysis worker is connected with the same `AO_PLC_WORKER_KEY`. Do not enable the mock adapter in production as a substitute for the real engineering engine.

The application records a per-job retention deadline and supports customer deletion. A scheduled retention sweeper can be added when the worker/service is connected so expired projects are removed automatically even if the customer never presses Delete.

# Skyward: bounded Cloudflare free-tier design

Status: capacity targets. A locally testable Workers/D1/R2 target is now prepared; see [CLOUDFLARE.md](CLOUDFLARE.md). No remote deployment or zero-overage guarantee.
Reviewed 2026-09-29. Target: Cloudflare Workers Free + D1 + R2 Standard + Better Auth.
D1 is the selected launch database; Neon remains an alternative. Migrating existing Neon users requires a separate tested data migration.

## Contract

Stay within free allowances by limiting supported workload and degrading service.
Unlimited traffic, accounts and storage cannot be promised for free. No automatic
paid-plan upgrade. New capacity requires an explicit product decision. Other apps
using the same Cloudflare account consume the same account-wide allowances; reserve
for them or use a dedicated account. Paid aviation APIs remain disabled unless
separately configured and funded; a Skyward subscription does not expand Cloudflare
free quotas automatically.

## Provider limits and initial application budgets

These are conservative design ceilings, not measured supported user counts.

| Resource | Published free allowance | Initial application ceiling |
| --- | --- | --- |
| D1 database | 500 MB per database; 5 GB total account storage | 350 MB warning; stop optional growth at 400 MB |
| D1 reads | 5 million rows/day | 3 million ordinary rows/day; reserve up to 1 million for essential work |
| D1 writes | 100,000 rows/day | 50,000 ordinary rows/day; reserve up to 20,000 for essential work |
| Workers dynamic requests | 100,000/day | Target 60,000/day; shed optional work by 70,000 |
| R2 Standard storage | 10 GB-month/month | 7 GB warning; reject additional storage above 8 GB |
| R2 Class A operations | 1 million/month | 600,000 ordinary operations; 100,000 reserved |
| R2 Class B operations | 10 million/month | 6 million ordinary operations; 1 million reserved |

Reserve covers authentication, subscription reconciliation, budget accounting,
cleanup, migration overhead and in-flight operations. It is finite: those services
may also become unavailable when the provider stops accepting requests. A Worker
cannot reject an incoming request before that request counts toward its own quota.
Workers/D1 Free provider enforcement is the final backstop, not continuous uptime.
Use provider billing units and reset boundaries; count index writes and rows scanned,
not merely SQL statements or rows returned. Storage includes indexes and allocated
pages. Deleting rows does not imply an immediate reduction in allocated DB size.

## Data placement and retention

- D1: Better Auth users/sessions, subscription identifiers, bounded saved-flight
  metadata, settings, simulator progress, idempotency and quota records. No model
  binaries, audio, screenshots, raw provider payload archives or per-frame updates.
- Static Assets: public aircraft models/textures, scripts and scenery files up to
  the static-file size limit. Builds fail rather than silently moving models to a billed path.
- R2: versioned private airport-game exports and explicitly bounded cloud recordings.
  Standard storage only. Recordings remain local/downloadable by default; cloud
  recording upload is disabled until storage and operation admission controls exist.
- Browser: simulated traffic, motion interpolation, current flight trails and local
  replays. Simulation must not generate persistent rows or backend polling traffic.
- Shared short-lived cache: regional aircraft/weather/provider responses. Never
  treat isolate-local memory or a cache hit as a global concurrency/budget guarantee.
  Do not put every live position into D1 or stream an unbounded archive into R2.

Initial per-user limits: 50 saved-flight summaries (4 KiB each), 20 simulator progress
summaries (4 KiB each), 16 KiB preferences, and five active sessions. Enforce schema
and encoded byte limits server-side, not only item counts. Compact essential billing
identifiers are separate. Validate Better Auth session limiting and refresh behavior
against the chosen D1 adapter before promising these limits.

Clean expired sessions/tokens daily in bounded, indexed batches; expire nonessential
operational events after seven days. Delete unverified abandoned signups after seven
days. Keep billing/idempotency records for the required retry/reconciliation window;
never purge them just to admit optional data. Preserve verified accounts, paid
entitlements and user saves. At capacity, block new signups/cloud saves and offer
local export rather than silently deleting durable user data. Retain only current
and previous asset releases; remove older versions only after their supported client
cache lifetime. Enforce caps on staged uploads and retained releases, not just the
currently active asset set.

Local observation: model assets currently occupy about 792 MiB on disk and public
reference data about 17 MiB. These are not R2 billing measurements. Generate an
exact-byte deployment manifest including textures, duplicate versions and staging
before upload; do not upload both source assets and the dist copy.

## Requests and caching

- Share provider lookups by normalized region/time window, respecting provider terms.
  Visible free clients start at a 60-second refresh, back off on errors, stop polling
  when hidden and request only the visible region. Smooth motion stays client-side.
- Cache public responses without user/session data. Keep authenticated and paid
  responses private. Suppress overlapping client requests and automatic retry storms.
- Do not query D1 for each free map refresh. Better Auth session checks must be kept
  out of public traffic endpoints; privileged operations still verify access.
- Serve eligible immutable app assets directly through static hosting/CDN rather than
  invoking application code for each asset. Check deployment asset-size limits first.
- Caching saves provider calls but does not necessarily save Worker invocations.
  At one dynamic poll/minute, a continuously active client makes 1,440 requests/day;
  60,000 requests/day supports only about 41 such client-days before other API work.
  This is an arithmetic ceiling, not a load-tested concurrency promise.

## Enforceable budgets and R2 exposure

Monitoring alerts alone are insufficient. Every optional mutation has a maximum
row/byte cost and must reserve capacity before execution. Use atomic conditional
updates and transactional D1 batches where applicable. A per-isolate counter is not
a global limit. Small bounded quota leases may reduce bookkeeping writes, but all
issued leases, retries, unused reservations and accounting writes consume capacity.
Test concurrent workers, crashes and UTC/month boundaries. Do not refund uncertain
operations. Reconcile estimates with D1 rows_read/rows_written and storage metrics.
Bound queries by indexed keys, pagination and schema; unknown-cost queries are not
allowed on the budgeted request path. Stop admission when accounting is unavailable.

R2 can charge beyond its included allowance. No publicly reachable R2 bucket,
unguarded custom-domain origin, r2.dev endpoint or unrestricted presigned upload in
strict-free mode. All R2 operations must use the admitted path; reserve worst-case
GET/HEAD/PUT/list/multipart/retry costs before origin access. Cache public immutable
assets when possible, keep private data private, and include all other account
access paths in accounting. Disable R2 serving/upload if these controls cannot be
verified. Public R2 + usage alerts is not a zero-overage design.

At warning thresholds, lengthen refresh intervals, pause prefetch and background
checks, and report capacity to the operator. At application ceilings, stop optional
cloud writes, recordings and origin fetches. Return stale cached data with its actual
timestamp or an explicit capacity response; never call stale data live. Keep the
static globe, local simulator and local recordings usable where assets are available.
Use independent budget pools so optional work cannot consume reserved account work.

## Implementation and release gates

1. Add the Workers runtime/bindings and D1 adapter/migrations for Better Auth and
   account data. Replace PostgreSQL advisory locks/FOR UPDATE with tested D1-safe
   atomic operations. Existing local node:sqlite code is not a D1 adapter.
2. Implement shared admission accounting, storage reservations, indexed retention,
   per-user limits, retry backoff and public/private cache separation.
3. Add asset manifest/size checks, bounded R2 upload pipeline and guarded origin access.
4. Test account isolation, login/logout/expiry, webhook idempotency, paid API budget
   races, duplicate requests, capacity exhaustion and reserved-capacity behavior.
5. Run realistic map sessions and measure actual Worker requests, D1 scans/writes,
   asset cache misses and auth churn. Reduce limits or admit fewer users if necessary.
6. Verify dashboards and fail-closed behavior on a free staging deployment before
   production. Migration and deployment are separate from this design document.

Sources (recheck before deployment):
- https://developers.cloudflare.com/d1/platform/limits/
- https://developers.cloudflare.com/d1/platform/pricing/
- https://developers.cloudflare.com/workers/platform/limits/
- https://developers.cloudflare.com/r2/pricing/
- https://neon.com/blog/how-to-make-the-most-of-neons-free-plan

## Implemented compact-account boundary (2026-09-29)

The product decision is to sync small user records, not to make all saves local.
Authentication, Premium access and protected API budgets remain server-side. Existing
account watchlists, viewing setups, journey metadata and small simulator results sync
on explicit changes. Watchlists refresh on account changes, edits and window focus;
they no longer query the account database every minute.

The existing SQLite development and Neon account implementations now enforce:

- 512 KiB combined account-library JSON payload per user, plus smaller per-kind limits
  defined in `web/src/lib/accountStoragePolicy.ts`. This is a payload budget, not a
  guarantee of database file size; auth, journeys, indexes and reserved operational
  data have separate footprints.
- 16 KiB per viewing setup; 4 KiB per mission/progress summary; 20 mission results;
  five airport career summaries. Summary fields are allowlisted. Flight replay
  samples, airport simulation state, ledgers and arbitrary extra fields are omitted.
- No new database recordings or photos; local recording/export tools remain available.
  Full airport career backups can be exported directly from the simulator. A compact
  career summary cannot restore a complete airport simulation on another device;
  transfer the full backup file for that. Existing full cloud saves remain readable.
- 64 KiB maximum incoming account-library request; unchanged validated saves do not
  rewrite their rows. Revision conflict checks and account ownership remain enforced.
- Existing oversized records are not deleted by migration. Users can read, export,
  delete or replace them with smaller allowed records. They can block new storage
  until capacity is reclaimed. No silent data loss.

These boundaries apply now to the existing account implementations. They do not
activate D1, migrate credentials or deploy Workers/R2. The global provider counters,
D1 adapter/runtime, retention jobs and R2 admission controls above remain release
requirements. Do not describe those provider-wide protections as implemented.


## Request reduction implemented (2026-09-30)

- All 3,936 current public model/texture files now use Workers Static Assets, with
  their original URLs and identical bytes. No Worker execution, coordinator request
  or R2 read is required to serve an existing model. One-hour browser caching keeps
  stable model URLs updateable; hashed app bundles retain immutable caching.
- Prepared static files increased from 1,641 to 5,577, below the build's 19,000-file
  ceiling. Private R2 release content fell from 3,954 objects / approximately 921 MiB
  to 18 objects / 98.9 MiB: 862,064,981 bytes removed per retained release. These are
  local build measurements, not production request or billing measurements.
- Selected-flight lookups reuse valid regional fixes within the existing ten-second
  freshness window. A one-second local scheduler resumes lookup when the actual
  source observation expires; this timer is not one network request per second.
  Missing, rejected, future-dated and stale observations do not suppress lookups.
  Watchlist polling also skips flights with fresh fixes. Synthetic aircraft do not
  generate selected-flight provider lookups.
- Existing hidden-tab pauses and API polling cadences remain. Rendering, animation,
  model detail and camera coverage are unchanged. No account or paid response was
  made publicly cacheable; private game files still require server-side access checks.

Camera traffic still uses up to five area requests every successful 35-second cycle;
selected-airport boards poll every 25 seconds. Selected-flight lookup can use up to
360 requests/hour, less when regional observations satisfy freshness. Provider-side
cache hits still consume Worker requests. Streaming region batching and cross-tab
coordination are not implemented by this change.

Before launch, measure Skyward plus Visitorping in the account dashboard. The current
50,000 coordinator admissions/day setting excludes static files but is not a cap on
all Worker requests, and rejected requests still count. Do not treat the older
capacity targets in this document as implemented account-wide enforcement.

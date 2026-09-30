# Premium home and live-service setup

The default remains test mode. No paid account or live provider was activated as
part of this implementation. Actual passenger names/counts remain unavailable.

## Customer features

- Account → Home: upcoming saved journey, private family labels, guided setup,
  preferred airports/types, a recent observation feed and allowance counters.
- Travel: local `.ics` parsing, explicit per-event review and saving, plus all-day
  UTC departure-date export. Local/TZID dates are flagged for confirmation rather
  than silently converted. Imported events are not booking confirmations. ICAO
  callsigns are required; IATA flight numbers are not automatically guessed.
- Premium preview: interactive feature walkthrough and a fictional 60-second
  Boeing 737 recording at `/?premiumPreview=1`. No signup or provider lookup.
- Sessions → Cinematic highlights: trim interval, selected aircraft, side/bird
  camera order, title, 10/20/30-second video, portrait or landscape. Portrait
  letterboxes the map to preserve context. Exports retain map/data credits and
  stay local. No audio capture; browser encoding support is required.
- Personalized feed uses already received positions from the last two minutes,
  within 50 nm of preferred airports or matching preferred aircraft types.
  It does not create tracking requests, infer absent flights or promise coverage.

## Opt-in live configuration

Only the Neon + Better Auth backend supports live billing/details. The SQLite
test backend remains unable to spend provider quota, even with a live mode flag.

Required server-only configuration:

- `SKYWARD_ACCOUNTS=neon`, verified email and the existing Neon/Auth setup.
- `SKYWARD_BILLING_MODE=live`, `STRIPE_SECRET_KEY=sk_live_…` and a live
  `STRIPE_PRICE_ID`. Use a separate production database/customer mapping;
  Stripe test customers cannot be reused with live credentials.
- `SKYWARD_AIRLABS_MODE=live` and `AIRLABS_API_KEY`.
- Set `SKYWARD_MONTHLY_LOOKUPS`, `SKYWARD_GLOBAL_LOOKUPS`,
  `SKYWARD_BUDGET_MICROS`, `SKYWARD_REQUEST_MICROS` conservatively for the actual
  provider contract. Cost is a reservation estimate, not a provider invoice.
- Push delivery additionally needs the existing VAPID configuration and explicit
  permission from each user's browser.

The service verifies an active subscription with a positive paid invoice, correct
customer/price and current period directly with Stripe. Development overrides and
test subscriptions do not authorize paid aviation requests. Checkout redirects
alone never grant access. No client-provided plan flag is trusted.

Flight checks verify the recurring callsign and UTC scheduled departure date;
when a saved aircraft identity exists it must also match. Landed/scheduled flights
need not have a fresh aircraft position to supply dated status. Wrong dates or
identities produce no verified result and no change alert. Gate and other missing
fields stay unavailable. Schedule boards are explicit, directional airport checks,
limited to 50 returned rows; no automatic pagination or polling. The provider's
schedule window is limited, not arbitrary future timetable coverage.

Requests reserve account/global allowance atomically before network I/O, outside
the transaction. Failed requests retain their reservation because providers may
charge them. Five-minute bounded in-memory caching and in-flight coalescing avoid
repeated requests on one server instance. Entitlement is checked before cache
access. Multiple instances share database budgets but not these caches.

Background monitoring uses the same lookup/verification path, 15-minute intervals
near the flight date and 30 background attempts per month. Verified changes enter
the existing inbox and bounded push queue. The Node server's minute tick must be
running; serverless deployments need a protected scheduled worker calling this
job. Push configuration and production provider credentials were not exercised.

## Verification and boundaries

Unit tests mock provider/Stripe boundaries; no live billable requests are made.
Run `npm --prefix web test` and `npm --prefix web run build`. The Neon integration
suite requires its separate test database configuration and otherwise skips.
Production activation still requires testing that configuration and real provider
coverage with an explicitly authorized budget. Do not advertise guaranteed global
positions or passenger manifests.

Official endpoint references: [flight details](https://airlabs.co/docs/flight),
[airport schedules](https://airlabs.co/docs/schedules),
[Stripe subscription object](https://docs.stripe.com/api/subscriptions/object).

## Boarding passes and manual passenger trips

Open **Account → Boarding passes**. Premium users can scan with a camera or import
PNG/JPEG/WebP/PDF files and review extracted trips. Barcode decoding and PDF
rendering are lazy-loaded and run locally. Supported BCBP barcode types are
PDF417, Aztec, Data Matrix and QR. Image quality and browser camera availability
vary; manual entry is always available. Encrypted PDFs and `.pkpass` files are
not supported. Use an image of the boarding pass instead. One readable barcode
per PDF page is extracted; a barcode can contain up to four flight legs.

The review form accepts a name or display name, flight number, date, airports,
seat and optional tracking callsign or saved-journey link. A barcode's day of year
needs a confirmed year and UTC departure date; no year or timezone is silently
claimed as verified. IATA ticket flight numbers are not guessed into ICAO tracking
callsigns. Linking an existing journey requires the same date/route and account.

The parser immediately reduces the scanned passenger name to initials. It never
returns PNR, check-in sequence, ticket identifiers or security data. Only the
explicit allowlisted fields reach account storage after the user presses Save.
Users may deliberately enter their full name instead of initials. Raw files and
barcodes are not uploaded, logged, cached, persisted or included in share links.
This is a personal trip organizer, not airline passenger-list access or a valid
boarding credential. Up to 50 entries, 1 KB each; view/delete remain available
after Premium expires, while additions and edits require Premium.

**Enable Share to Skyward** registers the existing service worker. Installed
browsers supporting Web Share Target can pass selected files into a RAM-only,
one-use, two-minute handoff. This does not grant Wallet or inbox access. If the
browser cannot share files, or the worker is restarted, import the file manually.
Physical camera quality and OS share-sheet availability require device testing;
local image/PDF decoding, manual entry, privacy and HTTP persistence are covered
by automated checks using synthetic boarding passes.

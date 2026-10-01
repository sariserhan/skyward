# Aircraft identities and following — V1

## Implementation and cost decision

The V1 uses the existing Vite/React frontend, Cloudflare Static Assets, existing account-library D1 storage, Better Auth and the existing free-feed search endpoint. It adds no Worker, Durable Object, R2 objects, cron, queue, database telemetry ingestion, SSE, WebSocket, email, paid lookup or photo download. Browsing the directory does not load Cesium or fetch aircraft positions.

Catalog: `web/data/airframe-catalog.json`. The validation and identity service is `web/src/lib/airframeCatalog.ts`. Build publication creates `web/public/data/airframes.json` with only allowed fields. Cloudflare preparation generates static route documents; unknown IDs retain the existing 404 behavior. The six-entry catalog contains NASA's two retired Shuttle Carrier Aircraft and retired SOFIA, plus NOAA's two WP-3D research aircraft and Gulfstream IV-SP, with official evidence. Unknown MSN, hex and history dates stay unknown.

The schema is Aircraft + registration/ICAO history arrays + NotableEntity + AircraftAssociation. Records have stable IDs, evidence, date intervals and confidence. Because this is a small, manually curated catalog, these are version-controlled static records rather than duplicated D1 tables. **No SQL migration is needed.** Account sync uses the existing `(user_id, kind, key)` primary key with `kind=aircraftfollows`, `key=airframes`, body `{ids:[internalAircraftId]}` and existing revision/ownership controls. Other library kinds are unchanged.

## Routes and UI

- `/aircraft/`: local catalog search by registration, hex, manufacturer, model, serial and operator.
- `/aircraft/<internal-id>/`: metadata, history, associations, sources and explicit latest-observation check.
- `/notable-aircraft/`, `/notable/<slug>/`: reviewed organizational aircraft associations.
- `/following/`: follow/unfollow, persistent browser list, explicit Premium merge or replacement of account list.
- `/admin/notable-aircraft/`: guided aircraft/entity/association editor, identity review queue, validation, local imports/exports and confirmed-duplicate merge tool. It has no production write authority, so opening the editor does not grant admin access. Repository/deployment access is the publication permission.
- Global observatory search includes catalog aircraft and notable entities; More tools links to all three public directories.

Public paths enter the sitemap; following/workbench are noindex and disallowed in robots.txt. Pages have canonical and social metadata. The existing live-flight watchlist and airport tools remain available separately.

## Identity rules

An internal ID represents one physical airframe, never a callsign. Serial evidence is manufacturer/serial-series scoped; a raw MSN without manufacturer is insufficient. Matching MSN can recognize a new registration or hex. Contradictory known serial evidence blocks resolution. Registration + hex require compatible HIGH-confidence, time-valid evidence. A registration alone does not automatically merge or create a physical identity. Ambiguous candidates remain unresolved; coverage of the catalog is intentionally limited.

Dates are UTC day strings; intervals are `[validFrom, validTo)`. Null means unknown, not a fabricated start/end date. Unknown end dates cannot prove that a registration remains current; curators must review source currency. More than one applicable HIGH-confidence identity disables that lookup instead of choosing arbitrarily. LOW evidence is not published.

Merge requires matching manufacturer, serial series and MSN. Old IDs stay as redirects, and local/account follow normalization resolves them to the surviving ID. Existing IDs cannot be dropped or reassigned to a different established serial during publication. Corrections to established serial identity require an explicit engineering review, not editing around the validation gate.

## Editorial workflow / audit

1. Open the workbench and import the complete `web/data/airframe-catalog.json`. It is read locally, not uploaded.
2. Use the guided forms to create/update aircraft, entities and associations, inspect evidence links, and explicitly mark verified associations reviewed. Advanced JSON remains available for bulk edits. Set `archived: true` to withdraw associations/entities; use `FORMERLY_ASSOCIATED` for former associations.
3. Validate and export. Validation checks syntax/evidence structure; it cannot determine whether a source actually supports the claim. A human reviewer must check that.
4. From `web/`, run `npm run catalog:import -- <reviewed-export.json> "Reviewer name"`.
5. The importer validates transition invariants and writes a local before/after audit under `web/data/airframe-audit/`. Review both diffs. Commit, test and release through the existing GitHub deployment workflow.

The source catalog and audit snapshots are not static public assets. Published associations require reviewed HIGH/MEDIUM evidence. Archived, LOW, unreviewed, personal entities and editorial notes are omitted. No scraping, automated ownership discovery, personal-location pages, occupant inference or behavioral analysis are implemented. An association never establishes who is onboard.

## Provider and history boundaries

Observation checks reuse `/api/search`, at most once per minute per mounted profile, only after a button press. Existing server cache, concurrency controls, per-client rate limits and application capacity checks remain in force. Passive browsing never polls. A followed-aircraft profile can explicitly start a ten-check monitoring session, at most once per minute, only while the document is visible. It stops on request errors, unfollow or navigation. Existing server rate/capacity controls remain authoritative; this browser limit is a usability safeguard, not an account-wide quota. An unambiguous registration match and matching known hex are required. Original timestamps remain intact; positions older than two minutes are marked stale. Synthetic data is rejected; animation, landing simulation and interpolated movement never become observed events.

Aircraft metadata is separate from observations. Recent flight history is explicitly unavailable rather than reconstructed from callsigns or animations. No historical provider retention or redistribution rights have been assumed. The current AirLabs integration is not called. Provider source labels and the existing attribution page remain visible for observation data.

Relevant documents checked 2026-09-30:
- https://api.adsb.lol/docs (ODbL data and API terms)
- https://airlabs.co/docs/historical (flight-number historical endpoint, not proof of universal airframe history)

In-page aircraft activity alerts default off and require a follow. They are opt-in for each open profile session; no email, push or closed-tab notifications are sent. The browser event detector stores at most 50 events for 24 hours in memory. Repeated distinct observations at least 30 seconds apart confirm airborne/ground changes; a 30-minute coverage gap resets the transition baseline and records reappearance. Event types are debounced for ten minutes. Stale, duplicate and out-of-order fixes cannot trigger alerts. No departure airport, landing time or occupant is inferred. Guest follows merge only when the user explicitly requests account sync; they never silently cross accounts on login.

## Resource budgets and limits

| Resource | Added behavior / cap |
| --- | --- |
| Catalog | 500 aircraft, 100 entities, 1,000 associations, 1 MiB source JSON |
| Aircraft histories | 30 registrations + 30 ICAO records; 10 aircraft sources |
| Follows | 50 unique internal IDs per list |
| D1 | Explicit Premium sync only; one row, maximum 4 KiB body per account; existing 512 KiB aggregate account ceiling |
| Writes | Unchanged lists perform no data update; revision conflicts fail; no position/history/audit writes to D1 |
| Static Assets | Existing preparation fails above 19,000 assets or 25 MiB per file |
| R2 | Zero new feature objects or reads |
| Paid aviation / email / photos | Zero calls |
| Background tracking | None; optional visible-page monitoring stops after ten checks |
| Activity / imported history | In-memory only: 50 events / 200 imported observations, 128 KiB import |

This design minimizes incremental consumption; it **cannot guarantee the entire shared account stays inside free allowances**. Cloudflare account-wide traffic includes Visitorping and other projects. Even a request rejected inside a Worker has already invoked it. A per-user cap does not create a global storage cap. This code does not change account plans, deploy resources, or claim that R2 has a universal hard billing ceiling.

Cloudflare Free currently limits Workers to 100,000 daily requests, D1 to 5 million rows read / 100,000 rows written daily with 5 GB total storage, and R2 Standard includes 10 GB-month, 1 million Class A / 10 million Class B operations monthly. Static Asset requests are free/unlimited. Free Worker/D1 limits reject work when exceeded; paid accounts and R2 require account-level usage monitoring. Verify the actual plan and shared headroom before enabling additional production use. Do not enable paid plans or raise budgets to make this feature work.

Official references:
- https://developers.cloudflare.com/workers/platform/limits/
- https://developers.cloudflare.com/workers/static-assets/billing-and-limitations/
- https://developers.cloudflare.com/d1/platform/pricing/
- https://developers.cloudflare.com/r2/pricing/

## Acceptance evidence

| Section | Result | Evidence / limitation |
| --- | --- | --- |
| Aircraft | PASS for catalog V1 | Search/profile/source fields; explicit observation lookup; fresh/stale/unknown tested. Actual feed coverage is not guaranteed. |
| Following | PASS | Browser follow -> refresh -> unfollow; duplicate normalization, Premium/isolation/revision tests. |
| Identity | PASS | Manufacturer-scoped serial tests; timed registration/hex tests; merge aliases preserve follows; unsafe publication rejected. |
| Notable aircraft | PASS with release-based admin workflow | Workbench import/validation/export; reviewed associations, exclusions and source rejection tests. Publishing requires repository review. |
| Data quality | PASS | No guessed fields; synthetic/future/stale observation cases; weak and contradictory matches rejected. |
| Recent flights | PARTIAL | Live-feed observed activity and local licensed observation imports work; no complete airport-to-airport flight-history service. |
| Notifications / reconciliation | PARTIAL | Opt-in in-page alerts, bounded visible-page checks, and serial/identifier review queue implemented. No closed-tab delivery or automatic registry reconciliation. |
| Shared-account free-tier guarantee | NOT ESTABLISHED | No code can infer or control other projects' traffic. Incremental budgets above are enforced; full account headroom needs account-level measurement. |

Run `node --test web/server/airframes.test.mjs`, `npm --prefix web test`, `npm --prefix web run build`, and `python web/tests/browser/airframe-following.py` with the documented Playwright environment. Browser fixtures do not prove worldwide feed coverage. No production publication or schema migration was performed.

### V1 follow-up: observation continuity and withdrawn entries

Profiles now retain the latest validated observation in sessionStorage (one per aircraft, ten aircraft maximum, 30-minute expiry). Reloading does not trigger a lookup or reset the one-minute cooldown. Stored positions are revalidated against the current catalog; original observation timestamps are preserved. Older feed responses cannot replace a newer observation. Conflicting registrations/hex identities, malformed coordinates, future timestamps, synthetic records and observations beyond the retention window are rejected. No tracks or additional server storage are created.

A followed ID that disappears from the public catalog is retained as an unavailable entry, with an explicit unfollow control. Existing account follows can still reference the underlying source-catalog identity without publishing withdrawn metadata. This prevents a later catalog withdrawal plus account sync from silently erasing the follow. Arbitrary IDs absent from the source catalog remain invalid for account storage.

Additional evidence: `web/server/airframe-observations.test.mjs` and the reload/withdrawal cases in `web/tests/browser/airframe-following.py`.


### Extended validation (2026-10-01)

The guided workbench supports creating/editing aircraft, dated identifier histories, entities, archived entities, reviewed source-backed associations and withdrawn associations. The review queue lists up to 100 manufacturer-scoped serial duplicate candidates or overlapping HIGH-confidence identifier conflicts. It never applies a merge automatically. Publication still goes through repository review and the audited CLI; this is not an authenticated production CRUD endpoint.

History import accepts a JSON object with `version: 1`, `aircraftId`, `sourceName`, HTTPS `sourceUrl`, `license`, and `observations`. Each row uses the existing normalized observation shape (Unix milliseconds, registration, hex, latitude as `lat`, longitude as `lon`). Imports are limited to 200 observations, 128 KiB and the previous 366 days. Dated identifiers must match, synthetic rows are rejected, and duplicates are removed. An import's source assertion is **not independently verified**. Imported rows remain clearly labeled, do not update live status, produce no alerts, are not uploaded, and disappear on navigation. Retired aircraft may have historical observations without becoming live aircraft.

ADSB.lol publishes ODbL daily historical archives: https://www.adsb.lol/docs/open-data/historical/. These are not a lightweight per-airframe history endpoint. This release does not download worldwide daily archives into a free Worker or claim that observed ground/air changes establish complete flights.

Run `npm --prefix web run check:free-budget` for a read-only Cloudflare account report. It reads subscription status, D1 database sizes and the daily Billable Usage API without printing secrets. Partial access returns exit code 2 instead of a false PASS. On 2026-10-01 the existing token returned D1 size **217,088 bytes**, but subscription and billable-usage reads returned **403**. Add Cloudflare **Billing Read** permission to inspect billing usage; no plans or production configuration were changed. Usage can lag and other projects share allowances, so this is not a spending cap. Reference: https://blog.cloudflare.com/billable-usage-api/.

Remaining limitations: no universal registry, licensed photograph catalog, complete flight-history endpoint, continuous worldwide event ingestion, or closed-tab email/push service. Those are not marked completed. No new paid service or Cloudflare resource was provisioned. The release remains local until the normal GitHub deployment.

Validation commands: `npm --prefix web test`, `npm --prefix web run build`, and the `airframe-following.py` browser flow. Tests cover debounced transitions, coverage gaps, history bounds/identity validation, review candidates/conflicts, guided create/associate/archive, alert controls, imports, refresh and device layouts.

### Curated directory (2026-10-01)

`/notable-aircraft/` now provides search by organization, team, registration, manufacturer, model or serial; category filters; direct follow/unfollow controls; and linked source detail pages. Query/filter selections survive refresh in the URL. The initial directory contains **15 aircraft, 10 collections and 17 sourced associations**. Categories overlap (for example, a company's historic aircraft appears under both Business & aviation and Historic).

Collections: New England Patriots, Seattle Kraken, San Francisco Giants, Alaska Airlines, Boeing, Icelandair, The Flying Bulls, NASA, NOAA and Orbis. This is a curated selection, not an exhaustive fleet or ownership registry. Personal entities remain excluded. No logos or aircraft photographs are copied from source sites.

Public association `context` (optional, maximum 500 characters) explains what a source actually documents. It is separate from internal `notes`, which remain unpublished. The workbench can edit this context. Entity pages display aircraft-level source links, review dates and the context. Sports-themed airline liveries are not labeled team-owned transports.

Source-review decisions:

- Patriots: FAA registry confirms N36NE / MSN 25193 / A40B24 and N225NE / MSN 25194 / A1F4C5. Official team material describes transport and goodwill missions; registration-specific photographic metadata supports the public association at MEDIUM confidence. The photo host restricted direct page access; no image-license or current charter-operator claim is made. FAA mailing addresses and personal details are not imported.
- Kraken: Alaska's October 2024 announcement identifies N933AK and the commemorative partnership; its media page identifies the 737-9 MAX. FAA supports MSN 44098 / ACF0D8. The livery is not evidence of passengers.
- Giants: the September 2021 Alaska announcement identifies N855VA and its planned livery period. The historical registration remains MEDIUM, so it does not authorize a current observation lookup. Neither a new registration nor a retirement date is invented.
- Boeing: the manufacturer's February 2026 story explicitly documents ZA004/N7874's retirement.
- Icelandair: its media kit identifies TF-FIU; its Icelandic Hekla Aurora page explicitly reports withdrawal in October 2025. The older English promotional page is not treated as proof of current service.
- Flying Bulls: the collection's DC-6B and P-38 stories identify OE-LDM (former N996DM) and N25Y. The DC-6 registration-change stories disagree on the exact date, so no precise date is fabricated. The old tail remains MEDIUM and the documented present tail HIGH, avoiding ambiguous live lookup. Historic does not mean retired.
- Orbis: FAA confirms N330AU / MSN 46800 / A395E2; the organization's own site explains the MD-10 Flying Eye Hospital. No patient or staff identity is inferred.

Every source URL is stored on the relevant catalog record and exposed through the aircraft/association source sections. Audited imports record the complete before/after catalog. No schema migration, new Worker, R2 object, external request on directory browsing, or database write was added. Existing explicit Premium following-list sync remains unchanged.

Validation: `web/server/notable-directory.test.mjs` exercises category/search behavior, hidden/empty entities, duplicate associations, context bounds and historical-identifier lookup protection. `web/tests/browser/notable-directory.py` exercises category/query URLs, source navigation, follow persistence, empty-state reset and desktop/mobile layout while asserting no Cesium or tracking-feed fetch. The existing aircraft-following/editor browser regression remains applicable.

### Live side-menu discovery

The aircraft browser's **Watch live · Teams & fleets** section matches the static
catalog against observations already loaded by the map. It adds no polling or
account writes. Entries require a current high-confidence ICAO identity, a
reviewed non-person/non-historic association, an airborne position no older than
two minutes, and a non-retired aircraft. Ground, synthetic, stale and conflicting
registration observations are hidden. This is area-scoped discovery, not a
worldwide active-fleet search. Selecting a result opens the existing aircraft
viewer; no follow action is required. The separate reference directory retains
historical aircraft and evidence, and is explicitly labeled as reference material.

The directory now defaults to **Watch live**, with **Aircraft & history** separate.
An explicit **Find airborne aircraft** action checks at most ten currently verified
organizational aircraft sequentially through the existing free search endpoint.
No checks run on page load or in the background. A one-minute session cooldown
survives tab changes and reloads when session storage is available; requests abort
on leaving and stop on errors. Only matched, recent airborne observations produce
Watch live links. Results expire after two minutes and make no passenger claim.

### Additional organizational fleet records (2026-10-01)

The catalog now contains 20 airframes in 10 collections. Added NOAA's N46RF,
N48RF, N56RF and N57RF DHC-6-300 Twin Otters using NOAA's fleet specifications;
N56RF also has FAA serial/ICAO evidence. Added Alaska Airlines N985AK, a Boeing
737-9 MAX with the Seattle World Cup commemorative livery documented in the
operator's June 10, 2026 announcement. This is airline branding, not a team charter
or a guarantee that its paint scheme remains unchanged. Evidence URLs accompany
each record; missing ICAO identities are left empty, never calculated or guessed.

Live discovery can be scoped to a collection, still capped at ten checks and a
shared one-minute session cooldown. A current verified registration can be queried
when ICAO evidence is unavailable. Results must match the registration exactly,
match an established ICAO address when present, have no conflicting catalog identity,
and contain only one observed address for that registration. Stale, ground and
ambiguous results are excluded. Cards show the verified model and destination
unknown; the existing flight viewer obtains route data separately if available.

### Sports expansion (2026-10-01)

The catalog contains 25 airframes and 15 collections, including eight sports
collections. Five JetBlue A320-232 airframes were added:

| Team branding | Registration | FAA serial | ICAO |
| --- | --- | --- | --- |
| New York Jets | N746JB | 3622 | aa099e |
| Boston Celtics | N595JB | 2286 | a7b0c4 |
| Boston Bruins | N632JB | 2647 | a845f4 |
| Brooklyn Nets | N633JB | 2671 | a849ab |
| Boston Red Sox | N605JB | 2368 | a7da9c |

FAA inquiry records establish aircraft identity. The PlaneCaptures photographic
catalog establishes the livery relationship at medium confidence; the source
links are retained on each profile. These are team-branded airline aircraft,
not evidence of team ownership, a current team charter, passengers, or an unchanged
paint scheme. This distinction appears directly on live cards and sidebar entries.

The **Sports teams** live selector checks eligible sports aircraft together within
the existing ten-request cap and shared session cooldown. Existing Patriots and
Kraken aircraft remain eligible; the historical Giants association does not gain
live eligibility from these changes. Ground, stale, ambiguous and simulated rows
remain excluded. There is no paid API, automatic polling or database write added.

This is a curated sports-aircraft directory, **not all sports-team flights**.
Sponsorship alone cannot establish a registration or a specific charter. Teams
without verified aircraft evidence remain absent. Rotating charters and temporary
paint schemes require additional dated evidence rather than inferred tail numbers.

## Separate contextual associations

`web/data/aircraft-context-associations.json` is a separate editorial dataset,
validated during catalog builds, never copied to public assets or joined into
live discovery, follows or activity alerts. It requires explicit current/historical/
unknown relationship, verification status, confidence, source and review date.
The local workbench can validate and export a context draft without uploading it.
Operational identifiers, coordinates, contact fields and occupant assertions are
not schema fields. Public historical context can be reviewed separately; this
change does not create a person-to-live-aircraft navigation path.

The dataset is empty: the supplied named-person seed references contain citation
placeholders rather than usable source URLs. They were not promoted into verified
records. Do not invent provenance to fill the dataset. The organizational seed
now mirrors the 25 existing reviewed aircraft, 15 entities and 27 associations;
this is an idempotent reviewed seed, not a claim of 25 newly discovered aircraft.

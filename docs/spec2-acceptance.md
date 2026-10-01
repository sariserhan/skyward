# spec2.md implementation and acceptance

2026-10-01. No production deployment, credential changes, provider signup, paid
lookups, or new database storage were performed.

## Acceptance summary

| Area | Result | Evidence / remaining work |
| --- | --- | --- |
| Seed import mechanism | PASS | `airframeSeed.ts`, CLI and spec2 tests: idempotent additive imports, stable IDs, conflicting records and duplicate serial/identifiers rejected; publication remains a separately reviewed existing command. |
| Entire supplied 26-row seed list | PARTIAL | The organizational seed now includes all 25 existing reviewed aircraft, 15 collections and 27 associations; imports are a no-op against the current catalog, including both Patriots records. The other 24 rows are named-person live-tracking seeds and were not imported. Citation placeholders in the attachment are not source URLs. No placeholder or unsupported identity is marked verified. |
| Public UI | PARTIAL | Existing directory, organization profiles, aircraft profiles, aircraft follows and source disclaimers work. Added methodology, verification/history labels, association types, review due labels and category filters. No personal live-tracking pages were implemented. Recent observed tracks retain up to 60 positions checked on the page, with original timestamps and no extra fetches or database writes. Current and historical aircraft are separated in collections. No personal live-tracking pages are provided. |
| Data compliance | PARTIAL | Provider inventory and source links are in `data-provider-compliance.md`. Public credits and privacy-field exclusion are implemented. AirLabs account-specific rights, production provider contact/restrictions remain unverified. No claim of full production compliance. |
| Identity and following | PASS | Existing permanent aircraft IDs, registration timelines, conflict detection, merges and follows retained. Charter callsigns are validated in a separate editorial dataset and never converted into aircraft identities. |

## Requirement mapping

1–5: Existing source-linked aircraft registry facts and observation timestamps
remain. Methodology distinguishes telemetry from occupants and animation. No new
provider or privacy-address discovery interface was added.

6, 16: `web/data/notable-aircraft.seed.json` contains the 25 source-backed organizational
airframes, including both Patriots aircraft. `catalog:seed` generates a new review draft without publishing or
mutating the catalog. Existing `catalog:import` writes an audited publication
change after review. Explicit VERIFIED/HISTORICAL/UNVERIFIED states are validated;
unverified aircraft and associations are excluded from the public projection. Seed imports now require explicit status on every aircraft and association and lastVerifiedAt on every association.
Historical airframes cannot authorize observation checks.

7–8: HISTORIC_ASSOCIATION and REPORTED_CHARTER join the distinct existing types.
`web/data/charter-associations.json` is empty because no source-backed, bounded
charter records were supplied. Its validator requires entity, season, callsign,
validity interval and source evidence. The build validates it but does not publish
editorial charter data or infer an airframe from it. No recurring charter flight
number was fabricated.

9–12: Existing directory/entity/aircraft routes and stable-ID follows are preserved.
Business, Corporate, Entertainment and Special Aircraft filters supplement the
existing Sports/Historic/Public service taxonomy. Categories without sourced
records show no matches. Displayed association types, status and verification
history remain distinct; no personal live-tracking pages are exposed.

The route-hint dataset license was verified as CC0 in both the upstream VRS and
ADSB.lol mirror repositories; evidence is recorded in the provider inventory.

13–15, 19: Provider permission inventory documents cache/history, attribution,
redistribution and privacy handling with unresolved items explicitly marked. The
public catalog uses a field whitelist; unknown contact/address fields and internal
notes are excluded. No tracking-website telemetry scraper or PIA inference added.

17–18: The workbench includes an unverified/90-day re-verification queue. Old
records remain; no silent deletion occurs. `/methodology/` is included in sitemap,
public-page navigation and generated Cloudflare static assets.

20: Changes reuse existing source JSON, static publishing, profile routes, local
follows and optional Premium sync. Tracking infrastructure was not rewritten.

## Reproducible validation

Executed locally: build passed; 582 tests passed, 1 skipped, 0 failed. All three
browser checks below passed, including mobile overflow, verification selection,
local follows, historical lookup restrictions and methodology navigation.
Cloudflare static packaging passed; no assets were uploaded.

- `npm --prefix web test`: includes seed idempotence/conflicts, private projection,
  history/live exclusions, 90-day boundary, charter schema and methodology tests.
- `npm --prefix web run build`: validates and generates public catalog/assets.
- `node web/scripts/seed-airframes.mjs web/data/notable-aircraft.seed.json /tmp/new-draft.json`
  (output must not already exist).
- Browser checks: `spec2.py`, `notable-directory.py`, `airframe-following.py`.
- `node web/scripts/prepare-cloudflare.mjs`: local packaging only, no deployment.

The supplied spec is **not fully accepted** while the PARTIAL rows above remain.

Browser plugin unavailable; local Playwright validated directory → organization → historical section,
profile → observation → recent track, mobile layout and zero automatic tracking calls.
Remaining external information: AirLabs plan/public-display agreement, production provider
contact status and any account-specific restrictions. The excluded personal tracking
seeds are not a pending implementation promise.

## Updated boundary implementation

Personal context has a separate editorial schema and local validation/export UI,
with explicit source/confidence/current-history fields and no live identity join.
The dataset remains empty until usable source-backed context is provided.
AirLabs account permissions are PARTIAL with all eight requested questions
documented in data-provider-compliance.md. Runtime calls and the live-check CLI
fail closed pending reviewed evidence; no key value or account query was exposed.
The catalog and existing non-AirLabs aircraft following remain independent.

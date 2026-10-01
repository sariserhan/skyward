# Fleet expansion and sidebar discovery — 2026-10-01

The public catalog now has **122 distinct airframes, 16 collections and 124
associations**. These are not 122 teams or 122 flights currently airborne.
The expansion adds 97 aircraft to the existing 25:

- 76 registration/model facts from [Finnair's official fleet](https://www.finnair.com/en/flight-information/finnair-fleet).
- 21 registration/model facts from [Icelandair's official MAX fleet](https://www.icelandair.com/about/our-fleet/boeing-737-max/).

Finnair's E190 and ATR aircraft are identified as operated by Norra, with a
Finnair service association rather than a false legal ownership claim. Production
list dates are not repurposed as ownership/registration effective dates. Unknown
serial numbers and ICAO hex identifiers remain absent. These records can use the
existing registration lookup fallback. IDs were minted once and must not be
reassigned when a registration changes.

The minimal reviewed fact manifest is `web/data/fleet-expansion-20261001.json`.
The existing import workflow recorded a before/after audit under
`web/data/airframe-audit/`. Review actor is explicitly Codex source review, not an
independent human audit. Catalog and additive seed are synchronized. Source-backed
fleet inclusion does not establish current airworthiness, livery, location,
passengers, or complete operator coverage; fresh telemetry is needed for live UI.

## Discovery

- Left-sidebar teams/fleets promotion is visible without opening a disclosure.
- Named collection shortcuts open the corresponding live directory selection.
- Watch-live actions appear only for fresh airborne matches in loaded observations.
- Unknown/inactive collections use “Find airborne aircraft”, not a live assertion.
- Large collections support explicit batches of up to 10 lookups, retaining the
  one-minute shared cooldown and no automatic polling. New catalog size does not
  turn into a 122-request sweep.
- No paid AirLabs request, new background job or database write was introduced.

## Latest user seed attachment

The 26-row attachment supplied later in this session includes actual source URLs,
unlike the earlier version. The two Patriots aircraft are existing records and
were deduplicated, not counted as additions. The remaining 24 named-person rows
were not added to live discovery or published as verified contextual facts.
Registry owner/trustee evidence alone does not prove each personal relationship;
some supplied URLs are themselves live personal-tracking services. No personal
tracking scrape, current identity enrichment, person notification or company-name
alias was added. The contextual dataset remains separate and unpublished.

## Validation

Build passed; 584 tests passed, 1 skipped. Playwright checks passed for the live
sidebar, live directory and reference directory on desktop/mobile, including
collection deep links, batch selection, no automatic tracking requests and
cooldown persistence. Browser plugin unavailable; existing local harness used.
Screenshots saved by the harness; direct image inspection was blocked by the
filesystem sandbox's mountinfo error. No production deployment performed.

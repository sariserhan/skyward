# Aviation provider usage review

Reviewed 2026-10-01. This is an implementation inventory, not certification of the
production account's contracts. No provider or credential was enabled by spec2.
Do not deploy a new provider until all permission fields are resolved against the
actual plan. Do not scrape tracking websites to obtain telemetry.

| Provider / source | License and commercial/public display | Cache / history | Attribution / redistribution | LADD / PIA handling | Evidence and outstanding work |
| --- | --- | --- | --- | --- | --- |
| ADSB.lol public position API | ODbL 1.0; public API documents free use. Commercial/database use remains subject to ODbL conditions. | Current server cache and bounded browser observations. ODbL obligations apply to retained/derived databases; no new server archive here. | Credit with ODbL link in methodology and About data. Evaluate share-alike obligations before distributing a derived database. | Consume only returned records. No FAA-restricted-feed reconstruction or PIA identity inference. Provider-specific LADD commitments are not established by the API page. | https://api.adsb.lol/docs ; https://www.adsb.lol/docs/open-data/api/ . Provider requests contact for production use; whether that contact occurred is not verified. |
| FlyItalyADSB supplemental API | API page permits commercial use within 100 requests/min/IP. Footer licenses data CC BY-SA 4.0. Higher volume, SLA or resale requires an enterprise agreement. | Existing bounded caches; no new archive. Redistribution/derived data must follow license and account terms. | Credit and license link on methodology. Do not offer bulk resale under the standard key. | Integration uses point/registration/ICAO/callsign endpoints only, not the PIA/LADD discovery endpoints. No deanonymization. Confirm any additional account obligations before expansion. | https://flyitalyadsb.com/en/dati/api/ . Key-controlled optional adapter; actual deployment/key entitlement not checked this turn. |
| AirLabs premium details/schedules | Proprietary account/API terms. Public general terms do not establish this account's downstream display/resale rights. **Contract review required** for complete acceptance. | Existing configured caches only. Historical retention and redistribution permission unresolved for the specific plan. | Plan-specific attribution, sharing and retention obligations must be recorded from the subscription agreement. Never expose the API key. | Honor provider suppression and restrictions. No alternative-identity reconstruction. Plan-specific LADD terms unresolved. | https://airlabs.co/terms-of-service . Premium guards and budget controls remain; no new use or production change. |
| ADSB.lol / Virtual Radar Server standing route data | CC0 1.0 in both the upstream dataset and mirror repositories; permits commercial reuse/public display under that dedication. | Caching and historical retention permitted by CC0; current implementation still uses bounded caches. | CC0 does not require attribution; existing source credits retained. No endorsement implied. | Standing route hints, not live positions or occupants. No identity reconstruction. | Verified 2026-10-01: https://github.com/vradarserver/standing-data/blob/main/LICENSE and https://github.com/adsblol/vrs-standing-data/blob/main/LICENSE . Dataset-specific license question resolved. |
| FAA registry | Official publicly released aircraft identity facts; not a telemetry feed. | Curated minimum identity facts and evidence links, not a bulk copy of documents. | Source-linked. Private contact/address fields excluded by the public projection. | Do not import fields withheld by FAA. Temporary privacy identities must not be inferred from motion or other side channels. | https://www.faa.gov/licenses_certificates/aircraft_certification/aircraft_registry/interactive_aircraft_inquiry |
| Operator disclosures / aviation photography references | Curated identity and association facts with links; no copied photos or bulk source content. | Dated evidence reviewed every 90 days. | Source names and links on profiles. Photographs retain their owners' rights; linking does not license copying. | No private contact information or occupant claims. | Per-record URLs in airframe-catalog.json. Attachment citation placeholders are not provenance. |

## Enforcement and limits

- `publishedCatalog` uses a field whitelist; unknown registry address/contact fields
  and editorial notes are omitted. UNVERIFIED aircraft/associations are excluded.
- Search uses established registration/ICAO evidence and rejects ambiguity. No PIA
  remapping system is implemented. Provider omissions cannot be reconstructed from
  callsigns or another identity guessed from motion.
- Follows reference aircraft IDs; notifications describe aircraft observations.
- Public methodology credits are available at `/methodology/`; map source credits
  remain in the existing About-data UI.
- The general provider documents above do **not** prove full account compliance.
  Outstanding production contact, AirLabs plan rights and
  provider-specific restrictions mean data-compliance acceptance is **PARTIAL**.
- Free-tier budgets are operational limits, not licenses. This change adds no
  paid requests, scheduled Workers, DB writes, raw-data export or source signup.

## AirLabs account review — PARTIAL (2026-10-01)

Inspected tracked configuration, adapter code, deployment configuration and local
configuration variable names. `web/.env.local` contains AIRLABS_API_KEY; no plan
name or contract was found. No key value was printed, no account/API lookup was
made and no credential was requested. Mode `live` in wrangler is configuration,
not proof of account permissions. Current adapters use `/flight` and `/schedules`,
not the `/flights` live-position endpoint.

| Question | Finding | Unresolved account evidence |
| --- | --- | --- |
| 1. Public display of API-derived live positions | PARTIAL: documented technical capability, no account grant located. | Permission to display positions on skyvvard.com, including public/free vs subscriber audiences and restrictions. |
| 2. Commercial use | PARTIAL: developer/product use cases are documented. | Actual plan permits this paid product and its intended use. |
| 3. Caching | PARTIAL: provider publishes caching guidance. | Permitted cache duration, shared-user cache, edge/server/browser storage and deletion requirements. Current details cache is five minutes. |
| 4. Historical retention | PARTIAL: no account retention terms located. | Permission and limits for saved journey checks, activity history, backups and user exports. |
| 5. Redistribution / derived data | PARTIAL: no account grant located. | Downstream display, derived tracks, user sharing/export and any bulk/API redistribution limits. We do not add a raw-data API. |
| 6. Attribution | PARTIAL: exact plan obligations not located. | Required wording, logos, links and placement, or explicit absence of such obligations. |
| 7. Private / non-airline aircraft coverage | PARTIAL: do not assume universal coverage from live-position marketing. | Plan coverage, exclusions/suppression and permitted handling of private/non-airline aircraft; no guarantee of every aircraft. |
| 8. Registration / ICAO lookup | PARTIAL: official documentation demonstrates `/flights?reg_number=…` and `/flights?hex=…`. | Entitlement to those endpoint filters/fields and applicable limits on this account. Technical availability is not licensing approval. |

Primary evidence reviewed:
- https://airlabs.co/docs/flights — live aircraft-position API.
- https://airlabs.co/how-to-track-a-flight — registration/hex lookup examples.
- https://airlabs.co/docs/flight — the existing scheduled-flight detail adapter.
- https://airlabs.co/serverless-flight-api-proxy — caching implementation guidance,
  not an account-specific retention grant.
- https://airlabs.co/terms-of-service — general terms, not a recorded plan contract.

### Deployment and runtime gate

`web/data/airlabs-permissions.json` records unresolved permissions, with no secrets.
`airlabsUsageAllowed` requires plan name, dated review, evidence links and VERIFIED
permissions for display, commercial use, caching, retention, derived data and
attribution. A review must confirm both permission and implementation of any
conditions before marking VERIFIED. It is not enough to set an environment flag.
The current JSON blocks live details/schedules before payment checks, cache reads,
quota reservations or network calls. Account `liveDetailsReady` becomes false.
The operator's live-check CLI is gated too; demo data remains available.
A future position adapter must additionally use `airlabsPositionUsageAllowed` for
private-aircraft coverage and registration/ICAO entitlements. No position adapter
or new provider was deployed here. Provider-independent catalog, follows and
existing non-AirLabs observations continue operating.

This commit does not change the running production deployment. After deployment,
existing AirLabs details and schedule calls remain unavailable until this review
is completed. No request was sent to AirLabs to test or infer rights.

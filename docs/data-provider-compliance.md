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
| ADSB.lol / Virtual Radar Server standing route data | Existing callsign route hints are separate from positions. Exact upstream dataset redistribution grant needs documented verification. | Existing route cache; no new archive. | Existing About-data credit. Route hints are not confirmed itineraries. | No occupant inference or private flight reconstruction. | https://vrs-standing-data.adsb.lol/ . **Unresolved** dataset-specific permission; do not expand distribution based solely on position API license. |
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
  Outstanding production contact, AirLabs plan rights, route-data licensing and
  provider-specific restrictions mean data-compliance acceptance is **PARTIAL**.
- Free-tier budgets are operational limits, not licenses. This change adds no
  paid requests, scheduled Workers, DB writes, raw-data export or source signup.

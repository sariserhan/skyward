# Airport landing and taxi coverage

The same watched-arrival controller serves every airport. IAD is the reference
for mapped runway exit, taxi and stand parking. Equal animation code does not
imply equal source-map coverage.

## October 1, 2026 validation

The offline audit covers all 1,152 bundled airports, both directions of every
runway, using a 30 m building-clearance envelope. It tests mapped connectivity,
not real gate assignments, ATC clearance, aircraft-type compatibility, or visual
certification. Widebody aircraft use a larger envelope at runtime and may find
fewer usable paths.

- Airports with at least one mapped runway-to-stand route: **36 → 73**.
- Airports with routes from every runway direction: **26 → 54**.
- Connected runway directions: **172 → 279**.
- Airports with taxi path data: **88 → 121**.
- Facility snapshots added for **33 airports**, including SFO and DCA.
- IAD: 8/8 directions. SFO: 8/8. DCA: 6/6. ESB: 4/4.
- IST remains 11/12; ORD remains disconnected despite mapped facilities.

The initial catalog import stopped on HTTP 429 from the public mapping service.
The smaller priority pass imported SFO and DCA; LAX/ORD retries remain incomplete.
No importer is left running. Resume with the paced importer after the service
cooldown; do not rotate endpoints to evade its limits. The world catalog is **not
yet at IAD quality**. Missing or disconnected pavement remains a data task.

## Shared improvements

- Connect path endpoints lying within 2 m of another mapped taxi segment.
  Do not bridge larger gaps or connect nearby parallel taxiways.
- Recognize an actual mapped segment/runway intersection even without a stored
  vertex on the runway centerline.
- Use mapped parking centerlines when gate-name markers are absent or detached.
  These display as `unassigned mapped stand`, never an invented gate number.
  Prefer reachable named stands before these fallbacks.
- Retain swept building-clearance checks for all added edges and final routes.
- Cache topology repairs by geometry identity; no per-frame graph repair.

`npm --prefix web run audit:taxi` regenerates
`web/data/taxi-route-audit.json`, with per-airport direction counts. Run the build
before the full tests after importing facilities: it regenerates flat-ground
footprints, coverage metadata and static-asset checksums.

All additions are static assets and local routing. No new paid API, database
writes, recurring Worker job or production upload is introduced. Existing
illustrative parking fallback remains clearly labeled where mapped routing fails;
it is excluded from the mapped coverage counts above.
